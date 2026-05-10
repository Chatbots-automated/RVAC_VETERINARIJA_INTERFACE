-- =====================================================================
-- Fix Allocation Analytics to Include Direct Batch Allocations
-- =====================================================================
-- Created: 2026-04-29
-- Description:
--   The previous view only counted allocations from farm_stock_allocations.
--   However, some allocations are created directly via batches table with
--   allocation_id pointing to a farm. This update includes both sources.
-- =====================================================================

DROP VIEW IF EXISTS public.vw_allocation_analytics_by_farm CASCADE;

CREATE OR REPLACE VIEW public.vw_allocation_analytics_by_farm AS
WITH farm_allocations AS (
    -- Source 1: farm_stock_allocations (warehouse-based allocations)
    SELECT 
        fsa.farm_id,
        fsa.id AS allocation_id,
        fsa.product_id,
        fsa.allocated_qty AS qty,
        fsa.allocation_date AS allocated_date,
        wb.purchase_price,
        wb.received_qty AS batch_qty,
        wb.id AS warehouse_batch_id,
        'farm_stock_allocation' AS source_type
    FROM public.farm_stock_allocations fsa
    LEFT JOIN public.warehouse_batches wb ON fsa.warehouse_batch_id = wb.id
    
    UNION ALL
    
    -- Source 2: batches with farm_id (direct farm batches - invoices received directly by farm)
    SELECT 
        b.farm_id,
        b.id AS allocation_id,
        b.product_id,
        b.received_qty AS qty,
        b.created_at::date AS allocated_date,
        b.purchase_price,
        b.received_qty AS batch_qty,
        NULL::uuid AS warehouse_batch_id,
        'direct_farm_batch' AS source_type
    FROM public.batches b
    WHERE b.farm_id IS NOT NULL
),
farm_allocation_values AS (
    SELECT 
        fa.farm_id,
        fa.allocation_id,
        fa.product_id,
        fa.qty,
        fa.allocated_date,
        fa.source_type,
        -- Calculate value: price per unit * quantity allocated
        CASE 
            WHEN fa.batch_qty > 0 
            THEN (fa.purchase_price * fa.qty / fa.batch_qty)
            ELSE fa.purchase_price * fa.qty
        END AS allocation_value,
        -- Try to get pre-discount price from invoice_items if available
        CASE
            WHEN ii.discount_percent IS NOT NULL AND ii.discount_percent > 0 AND ii.discount_percent < 100
            THEN (ii.total_price / (1 - ii.discount_percent / 100.0)) * (fa.qty / NULLIF(fa.batch_qty, 0))
            ELSE 
                CASE 
                    WHEN fa.batch_qty > 0 
                    THEN (fa.purchase_price * fa.qty / fa.batch_qty)
                    ELSE fa.purchase_price * fa.qty
                END
        END AS allocation_value_before_discount
    FROM farm_allocations fa
    LEFT JOIN LATERAL (
        SELECT ii0.total_price, ii0.discount_percent
        FROM public.invoice_items ii0
        WHERE ii0.warehouse_batch_id = fa.warehouse_batch_id
        ORDER BY ii0.line_no NULLS LAST, ii0.id
        LIMIT 1
    ) ii ON true
)
SELECT 
    f.id AS farm_id,
    f.name AS farm_name,
    f.code AS farm_code,
    COUNT(DISTINCT fav.allocation_id) AS total_allocations,
    COUNT(DISTINCT fav.product_id) AS unique_products,
    COALESCE(SUM(fav.qty), 0) AS total_qty_allocated,
    COALESCE(SUM(fav.allocation_value), 0) AS total_value_allocated,
    COALESCE(SUM(fav.allocation_value_before_discount), 0) AS total_value_allocated_before_discount,
    MAX(fav.allocated_date) AS last_allocation_date
FROM public.farms f
LEFT JOIN farm_allocation_values fav ON f.id = fav.farm_id
GROUP BY f.id, f.name, f.code
ORDER BY total_value_allocated DESC NULLS LAST;

COMMENT ON VIEW public.vw_allocation_analytics_by_farm IS 'Farm allocation analytics combining farm_stock_allocations (warehouse) and batches with farm_id (direct farm invoices). Shows value after discount and before discount.';
