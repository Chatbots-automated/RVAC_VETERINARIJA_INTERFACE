-- =====================================================================
-- Add Warehouse System for Farm-Wide Stock Management
-- =====================================================================
-- Migration: 20260321000001
-- Created: 2026-03-21
--
-- OVERVIEW:
-- This migration introduces a two-tier inventory system:
-- 1. Warehouse level (farm-wide): Stock received from suppliers
-- 2. Farm level: Stock allocated from warehouse to specific farms
--
-- CHANGES:
-- 1. Add warehouse_batches table (farm_id = NULL for warehouse stock)
-- 2. Add farm_stock_allocations table (tracks warehouse → farm transfers)
-- 3. Update batches table to reference allocation_id
-- 4. Add views for farm-wide reporting
-- 5. Add analytics views for allocation tracking
-- =====================================================================

-- =====================================================================
-- 1. WAREHOUSE BATCHES TABLE
-- =====================================================================
-- This table stores stock at the warehouse level (before farm allocation)
-- Similar to batches but with farm_id = NULL to indicate warehouse stock

CREATE TABLE IF NOT EXISTS public.warehouse_batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    product_id uuid REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
    supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
    invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
    lot text,
    mfg_date date,
    expiry_date date,
    doc_title text,
    doc_number text,
    doc_date date,
    purchase_price numeric(12,2),
    currency text DEFAULT 'EUR',
    received_qty numeric NOT NULL,
    qty_left numeric(10,2),
    qty_allocated numeric(10,2) DEFAULT 0,
    invoice_path text,
    serial_number text,
    package_size numeric(10,2),
    package_count numeric(10,2),
    batch_number text,
    status text DEFAULT 'active',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT warehouse_batches_received_qty_check CHECK (received_qty >= 0),
    CONSTRAINT warehouse_batches_qty_allocated_check CHECK (qty_allocated >= 0),
    CONSTRAINT warehouse_batches_qty_allocated_lte_received CHECK (qty_allocated <= received_qty),
    CONSTRAINT warehouse_batches_status_check CHECK (status = ANY (ARRAY['active', 'depleted', 'expired', 'fully_allocated']))
);

COMMENT ON TABLE public.warehouse_batches IS 'Farm-wide warehouse inventory before allocation to specific farms';
COMMENT ON COLUMN public.warehouse_batches.received_qty IS 'Total quantity received from supplier';
COMMENT ON COLUMN public.warehouse_batches.qty_left IS 'Quantity remaining in warehouse (not yet allocated)';
COMMENT ON COLUMN public.warehouse_batches.qty_allocated IS 'Total quantity allocated to farms';

-- =====================================================================
-- 2. FARM STOCK ALLOCATIONS TABLE
-- =====================================================================
-- Tracks the transfer of stock from warehouse to specific farms

-- Drop the table if it exists to recreate with correct types
DROP TABLE IF EXISTS public.farm_stock_allocations CASCADE;

CREATE TABLE public.farm_stock_allocations (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    warehouse_batch_id uuid REFERENCES public.warehouse_batches(id) ON DELETE CASCADE NOT NULL,
    farm_id uuid REFERENCES public.farms(id) ON DELETE CASCADE NOT NULL,
    product_id uuid REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
    allocated_qty numeric NOT NULL,
    allocated_by text,
    allocation_date timestamptz DEFAULT now() NOT NULL,
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT farm_stock_allocations_allocated_qty_check CHECK (allocated_qty > 0)
);

COMMENT ON TABLE public.farm_stock_allocations IS 'Tracks stock allocation from warehouse to specific farms';
COMMENT ON COLUMN public.farm_stock_allocations.allocated_by IS 'Name or email of user who performed the allocation';
COMMENT ON COLUMN public.farm_stock_allocations.allocated_qty IS 'Quantity allocated to the farm';
COMMENT ON COLUMN public.farm_stock_allocations.allocated_by IS 'User who performed the allocation';

-- =====================================================================
-- 3. UPDATE BATCHES TABLE
-- =====================================================================
-- Add allocation_id to link farm batches to their warehouse allocation

ALTER TABLE public.batches 
ADD COLUMN IF NOT EXISTS allocation_id uuid REFERENCES public.farm_stock_allocations(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.batches.allocation_id IS 'Links farm batch to its warehouse allocation source';

-- =====================================================================
-- 4. INDEXES
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_warehouse_batches_product_id ON public.warehouse_batches (product_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_batches_expiry ON public.warehouse_batches (expiry_date);
CREATE INDEX IF NOT EXISTS idx_warehouse_batches_status ON public.warehouse_batches (status);
CREATE INDEX IF NOT EXISTS idx_warehouse_batches_qty_left ON public.warehouse_batches (qty_left) WHERE qty_left > 0;

CREATE INDEX IF NOT EXISTS idx_farm_stock_allocations_warehouse_batch ON public.farm_stock_allocations (warehouse_batch_id);
CREATE INDEX IF NOT EXISTS idx_farm_stock_allocations_farm_id ON public.farm_stock_allocations (farm_id);
CREATE INDEX IF NOT EXISTS idx_farm_stock_allocations_product_id ON public.farm_stock_allocations (product_id);
CREATE INDEX IF NOT EXISTS idx_farm_stock_allocations_date ON public.farm_stock_allocations (allocation_date);

CREATE INDEX IF NOT EXISTS idx_batches_allocation_id ON public.batches (allocation_id);

-- =====================================================================
-- 5. TRIGGERS
-- =====================================================================

-- Trigger to update warehouse_batches qty_left and qty_allocated when allocation is made
CREATE OR REPLACE FUNCTION public.update_warehouse_batch_on_allocation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Decrease qty_left and increase qty_allocated in warehouse
        UPDATE public.warehouse_batches
        SET 
            qty_left = qty_left - NEW.allocated_qty,
            qty_allocated = qty_allocated + NEW.allocated_qty,
            status = CASE 
                WHEN (qty_left - NEW.allocated_qty) <= 0 THEN 'fully_allocated'
                ELSE status
            END,
            updated_at = now()
        WHERE id = NEW.warehouse_batch_id;
        
        -- Verify warehouse has enough stock
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Warehouse batch not found';
        END IF;
        
    ELSIF TG_OP = 'DELETE' THEN
        -- Reverse the allocation (return stock to warehouse)
        UPDATE public.warehouse_batches
        SET 
            qty_left = qty_left + OLD.allocated_qty,
            qty_allocated = qty_allocated - OLD.allocated_qty,
            status = 'active',
            updated_at = now()
        WHERE id = OLD.warehouse_batch_id;
    END IF;
    
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_warehouse_on_allocation ON public.farm_stock_allocations;
CREATE TRIGGER trigger_update_warehouse_on_allocation
    AFTER INSERT OR DELETE ON public.farm_stock_allocations
    FOR EACH ROW
    EXECUTE FUNCTION public.update_warehouse_batch_on_allocation();

-- Trigger to initialize warehouse batch fields (similar to batches)
CREATE OR REPLACE FUNCTION public.initialize_warehouse_batch_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Calculate received_qty from package_size and package_count if provided
    IF NEW.package_size IS NOT NULL AND NEW.package_count IS NOT NULL THEN
        NEW.received_qty := NEW.package_size * NEW.package_count;
    END IF;

    -- Initialize qty_left to received_qty if not set
    IF NEW.qty_left IS NULL THEN
        NEW.qty_left := NEW.received_qty;
    END IF;

    -- Initialize qty_allocated to 0 if not set
    IF NEW.qty_allocated IS NULL THEN
        NEW.qty_allocated := 0;
    END IF;

    -- Generate batch_number if not provided
    IF NEW.batch_number IS NULL THEN
        IF NEW.lot IS NOT NULL AND NEW.lot != '' THEN
            NEW.batch_number := NEW.lot;
        ELSE
            NEW.batch_number := 'WH-' || to_char(NEW.created_at, 'YYYYMMDD-HH24MI');
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_initialize_warehouse_batch_fields ON public.warehouse_batches;
CREATE TRIGGER trigger_initialize_warehouse_batch_fields
    BEFORE INSERT ON public.warehouse_batches
    FOR EACH ROW
    EXECUTE FUNCTION public.initialize_warehouse_batch_fields();

-- Trigger to set updated_at timestamp
DROP TRIGGER IF EXISTS set_updated_at_warehouse_batches ON public.warehouse_batches;
CREATE TRIGGER set_updated_at_warehouse_batches 
    BEFORE UPDATE ON public.warehouse_batches
    FOR EACH ROW 
    EXECUTE FUNCTION public.trigger_set_timestamp();

DROP TRIGGER IF EXISTS set_updated_at_farm_stock_allocations ON public.farm_stock_allocations;
CREATE TRIGGER set_updated_at_farm_stock_allocations 
    BEFORE UPDATE ON public.farm_stock_allocations
    FOR EACH ROW 
    EXECUTE FUNCTION public.trigger_set_timestamp();

-- =====================================================================
-- 6. VIEWS FOR WAREHOUSE MANAGEMENT
-- =====================================================================

-- View: Warehouse inventory with available stock
CREATE OR REPLACE VIEW public.vw_warehouse_inventory AS
SELECT 
    wb.id AS warehouse_batch_id,
    wb.product_id,
    p.name AS product_name,
    p.category,
    p.primary_pack_unit AS unit,
    p.primary_pack_size,
    wb.lot,
    wb.mfg_date,
    wb.expiry_date,
    wb.received_qty,
    wb.qty_left,
    wb.qty_allocated,
    wb.status,
    wb.purchase_price,
    wb.currency,
    wb.doc_number,
    wb.doc_date,
    s.name AS supplier_name,
    wb.created_at
FROM public.warehouse_batches wb
JOIN public.products p ON wb.product_id = p.id
LEFT JOIN public.suppliers s ON wb.supplier_id = s.id
ORDER BY wb.created_at DESC;

COMMENT ON VIEW public.vw_warehouse_inventory IS 'Warehouse inventory with product details and allocation status';

-- View: Stock allocation history with details
CREATE OR REPLACE VIEW public.vw_stock_allocation_history AS
SELECT 
    fsa.id AS allocation_id,
    fsa.allocation_date,
    f.name AS farm_name,
    f.code AS farm_code,
    p.name AS product_name,
    p.category,
    fsa.allocated_qty,
    p.primary_pack_unit AS unit,
    wb.lot,
    wb.expiry_date,
    fsa.allocated_by AS allocated_by_name,
    fsa.notes,
    fsa.warehouse_batch_id,
    fsa.farm_id,
    fsa.product_id
FROM public.farm_stock_allocations fsa
JOIN public.farms f ON fsa.farm_id = f.id
JOIN public.products p ON fsa.product_id = p.id
JOIN public.warehouse_batches wb ON fsa.warehouse_batch_id = wb.id
ORDER BY fsa.allocation_date DESC;

COMMENT ON VIEW public.vw_stock_allocation_history IS 'Complete history of stock allocations from warehouse to farms';

-- View: Allocation analytics by farm
CREATE OR REPLACE VIEW public.vw_allocation_analytics_by_farm AS
SELECT 
    f.id AS farm_id,
    f.name AS farm_name,
    f.code AS farm_code,
    COUNT(DISTINCT fsa.id) AS total_allocations,
    COUNT(DISTINCT fsa.product_id) AS unique_products,
    SUM(fsa.allocated_qty) AS total_qty_allocated,
    SUM(wb.purchase_price * (fsa.allocated_qty / wb.received_qty)) AS total_value_allocated,
    MAX(fsa.allocation_date) AS last_allocation_date
FROM public.farms f
LEFT JOIN public.farm_stock_allocations fsa ON f.id = fsa.farm_id
LEFT JOIN public.warehouse_batches wb ON fsa.warehouse_batch_id = wb.id
GROUP BY f.id, f.name, f.code
ORDER BY total_value_allocated DESC NULLS LAST;

COMMENT ON VIEW public.vw_allocation_analytics_by_farm IS 'Analytics showing which farms receive the most stock allocations';

-- View: Allocation analytics by product
CREATE OR REPLACE VIEW public.vw_allocation_analytics_by_product AS
SELECT 
    p.id AS product_id,
    p.name AS product_name,
    p.category,
    COUNT(DISTINCT fsa.farm_id) AS farms_using,
    COUNT(DISTINCT fsa.id) AS total_allocations,
    SUM(fsa.allocated_qty) AS total_qty_allocated,
    p.primary_pack_unit AS unit,
    MAX(fsa.allocation_date) AS last_allocation_date
FROM public.products p
LEFT JOIN public.farm_stock_allocations fsa ON p.id = fsa.product_id
GROUP BY p.id, p.name, p.category, p.primary_pack_unit
ORDER BY total_qty_allocated DESC NULLS LAST;

COMMENT ON VIEW public.vw_allocation_analytics_by_product IS 'Analytics showing which products are allocated most';

-- =====================================================================
-- 7. ROW LEVEL SECURITY (RLS)
-- =====================================================================
-- NOTE: This app uses custom auth (not Supabase Auth), so auth.uid() returns NULL
-- RLS is disabled for warehouse tables - access control handled at application level

ALTER TABLE public.warehouse_batches DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.farm_stock_allocations DISABLE ROW LEVEL SECURITY;

-- =====================================================================
-- 8. GRANT PERMISSIONS
-- =====================================================================

GRANT SELECT ON public.warehouse_batches TO authenticated;
GRANT ALL ON public.warehouse_batches TO authenticated;

GRANT SELECT ON public.farm_stock_allocations TO authenticated;
GRANT ALL ON public.farm_stock_allocations TO authenticated;

GRANT SELECT ON public.vw_warehouse_inventory TO authenticated;
GRANT SELECT ON public.vw_stock_allocation_history TO authenticated;
GRANT SELECT ON public.vw_allocation_analytics_by_farm TO authenticated;
GRANT SELECT ON public.vw_allocation_analytics_by_product TO authenticated;
