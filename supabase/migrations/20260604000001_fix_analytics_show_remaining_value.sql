-- =====================================================================
-- Fix Allocation Analytics to Show REMAINING Value (Not Total Allocated)
-- =====================================================================
-- Created: 2026-06-04
-- Description:
--   The previous view showed total_value_allocated based on received_qty.
--   This was misleading because when products are used in treatments,
--   qty_left decreases but the analytics still showed the full value.
--   
--   This fix changes the view to show REMAINING value based on qty_left,
--   which is the actual current stock value at each farm.
-- =====================================================================

DROP VIEW IF EXISTS public.vw_allocation_analytics_by_farm CASCADE;

CREATE OR REPLACE VIEW public.vw_allocation_analytics_by_farm AS
WITH farm_allocations AS (
    -- Source 1: farm_stock_allocations (warehouse-based allocations)
    -- Get remaining qty from the linked farm batch
    SELECT 
        fsa.farm_id,
        fsa.id AS allocation_id,
        fsa.product_id,
        fsa.allocated_qty AS original_qty,
        COALESCE(b.qty_left, fsa.allocated_qty) AS remaining_qty,
        fsa.allocation_date AS allocated_date,
        wb.purchase_price,
        wb.received_qty AS batch_qty,
        wb.id AS warehouse_batch_id,
        'farm_stock_allocation' AS source_type
    FROM public.farm_stock_allocations fsa
    LEFT JOIN public.warehouse_batches wb ON fsa.warehouse_batch_id = wb.id
    -- Join to get the actual remaining qty from the farm batch
    LEFT JOIN public.batches b ON b.allocation_id = fsa.id
    
    UNION ALL
    
    -- Source 2: batches with farm_id (direct farm batches - invoices received directly by farm)
    SELECT 
        b.farm_id,
        b.id AS allocation_id,
        b.product_id,
        b.received_qty AS original_qty,
        COALESCE(b.qty_left, 0) AS remaining_qty,
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
        fa.original_qty,
        fa.remaining_qty,
        fa.allocated_date,
        fa.source_type,
        -- Calculate REMAINING value: price per unit * REMAINING quantity
        CASE 
            WHEN fa.batch_qty > 0 
            THEN (fa.purchase_price * fa.remaining_qty / fa.batch_qty)
            ELSE fa.purchase_price * fa.remaining_qty
        END AS remaining_value,
        -- Calculate remaining value before discount
        CASE
            WHEN ii.discount_percent IS NOT NULL AND ii.discount_percent > 0 AND ii.discount_percent < 100
            THEN (ii.total_price / (1 - ii.discount_percent / 100.0)) * (fa.remaining_qty / NULLIF(fa.batch_qty, 0))
            ELSE 
                CASE 
                    WHEN fa.batch_qty > 0 
                    THEN (fa.purchase_price * fa.remaining_qty / fa.batch_qty)
                    ELSE fa.purchase_price * fa.remaining_qty
                END
        END AS remaining_value_before_discount
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
    COALESCE(SUM(fav.original_qty), 0) AS total_qty_allocated,
    -- Show REMAINING value, not total allocated
    COALESCE(SUM(fav.remaining_value), 0) AS total_value_allocated,
    COALESCE(SUM(fav.remaining_value_before_discount), 0) AS total_value_allocated_before_discount,
    MAX(fav.allocated_date) AS last_allocation_date
FROM public.farms f
LEFT JOIN farm_allocation_values fav ON f.id = fav.farm_id
GROUP BY f.id, f.name, f.code
ORDER BY total_value_allocated DESC NULLS LAST;

COMMENT ON VIEW public.vw_allocation_analytics_by_farm IS 'Farm allocation analytics showing REMAINING stock value (based on qty_left). When products are used in treatments, the value decreases accordingly. Combines farm_stock_allocations (warehouse) and batches with farm_id (direct farm invoices).';
