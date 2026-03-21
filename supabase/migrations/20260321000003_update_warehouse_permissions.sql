-- =====================================================================
-- Update Permissions for Warehouse System
-- =====================================================================
-- Migration: 20260321000003
-- Created: 2026-03-21
--
-- OVERVIEW:
-- Updates suppliers and products tables to support warehouse-level records
-- (farm_id can be NULL for shared warehouse resources)
-- =====================================================================

-- =====================================================================
-- 1. UPDATE SUPPLIERS TABLE
-- =====================================================================
-- Allow suppliers to be warehouse-level (farm_id = NULL)

ALTER TABLE public.suppliers 
ALTER COLUMN farm_id DROP NOT NULL;

COMMENT ON COLUMN public.suppliers.farm_id IS 'Farm ID for farm-specific suppliers, or NULL for warehouse-level suppliers shared across all farms';

-- Update RLS policies for suppliers
DROP POLICY IF EXISTS "Users can view suppliers in their farm" ON public.suppliers;
CREATE POLICY "Users can view suppliers in their farm"
    ON public.suppliers FOR SELECT
    USING (
        farm_id = public.get_user_farm_id() OR 
        farm_id IS NULL OR
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

DROP POLICY IF EXISTS "Users can manage suppliers in their farm" ON public.suppliers;
CREATE POLICY "Users can manage suppliers in their farm"
    ON public.suppliers FOR ALL
    USING (
        farm_id = public.get_user_farm_id() OR
        (farm_id IS NULL AND EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        ))
    );

-- =====================================================================
-- 2. UPDATE PRODUCTS TABLE
-- =====================================================================
-- Allow products to be warehouse-level (farm_id = NULL for shared products)

ALTER TABLE public.products 
ALTER COLUMN farm_id DROP NOT NULL;

COMMENT ON COLUMN public.products.farm_id IS 'Farm ID for farm-specific products, or NULL for warehouse-level products shared across all farms';

-- Update RLS policies for products
DROP POLICY IF EXISTS "Users can view products in their farm" ON public.products;
CREATE POLICY "Users can view products in their farm"
    ON public.products FOR SELECT
    USING (
        farm_id = public.get_user_farm_id() OR 
        farm_id IS NULL OR
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

DROP POLICY IF EXISTS "Users can manage products in their farm" ON public.products;
CREATE POLICY "Users can manage products in their farm"
    ON public.products FOR ALL
    USING (
        farm_id = public.get_user_farm_id() OR
        (farm_id IS NULL AND EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        ))
    );

-- =====================================================================
-- 3. ADD WAREHOUSE PERMISSION CHECK FUNCTION
-- =====================================================================

CREATE OR REPLACE FUNCTION public.is_warehouse_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.users 
        WHERE users.id = auth.uid() 
        AND users.role = 'admin'
    );
$$;

COMMENT ON FUNCTION public.is_warehouse_admin() IS 'Returns true if current user is an admin (has warehouse access)';

-- =====================================================================
-- 4. UPDATE INVOICES TABLE
-- =====================================================================
-- Allow invoices to be warehouse-level

ALTER TABLE public.invoices 
ALTER COLUMN farm_id DROP NOT NULL;

COMMENT ON COLUMN public.invoices.farm_id IS 'Farm ID for farm-specific invoices, or NULL for warehouse-level invoices';

-- Update RLS policies for invoices
DROP POLICY IF EXISTS "Users can view invoices in their farm" ON public.invoices;
CREATE POLICY "Users can view invoices in their farm"
    ON public.invoices FOR SELECT
    USING (
        farm_id = public.get_user_farm_id() OR 
        farm_id IS NULL OR
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

DROP POLICY IF EXISTS "Users can manage invoices in their farm" ON public.invoices;
CREATE POLICY "Users can manage invoices in their farm"
    ON public.invoices FOR ALL
    USING (
        farm_id = public.get_user_farm_id() OR
        (farm_id IS NULL AND EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        ))
    );

-- =====================================================================
-- 5. UPDATE INVOICE_ITEMS TABLE
-- =====================================================================
-- Allow invoice_items to be warehouse-level and reference warehouse_batches

ALTER TABLE public.invoice_items 
ALTER COLUMN farm_id DROP NOT NULL;

ALTER TABLE public.invoice_items 
ALTER COLUMN batch_id DROP NOT NULL;

ALTER TABLE public.invoice_items 
ADD COLUMN IF NOT EXISTS warehouse_batch_id uuid REFERENCES public.warehouse_batches(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.invoice_items.farm_id IS 'Farm ID for farm-specific invoice items, or NULL for warehouse-level invoice items';
COMMENT ON COLUMN public.invoice_items.batch_id IS 'Reference to farm-level batch (NULL for warehouse items)';
COMMENT ON COLUMN public.invoice_items.warehouse_batch_id IS 'Reference to warehouse-level batch (NULL for farm items)';

-- Update RLS policies for invoice_items
DROP POLICY IF EXISTS "Users can view invoice_items in their farm" ON public.invoice_items;
CREATE POLICY "Users can view invoice_items in their farm"
    ON public.invoice_items FOR SELECT
    USING (
        farm_id = public.get_user_farm_id() OR 
        farm_id IS NULL OR
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

DROP POLICY IF EXISTS "Users can manage invoice_items in their farm" ON public.invoice_items;
CREATE POLICY "Users can manage invoice_items in their farm"
    ON public.invoice_items FOR ALL
    USING (
        farm_id = public.get_user_farm_id() OR
        (farm_id IS NULL AND EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        ))
    );
