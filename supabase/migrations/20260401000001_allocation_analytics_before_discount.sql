-- Add pre-discount allocation value (aligned with sąskaitos / invoice line logic)
DROP VIEW IF EXISTS public.vw_allocation_analytics_by_farm CASCADE;

CREATE OR REPLACE VIEW public.vw_allocation_analytics_by_farm AS
SELECT 
    f.id AS farm_id,
    f.name AS farm_name,
    f.code AS farm_code,
    COUNT(DISTINCT fsa.id) AS total_allocations,
    COUNT(DISTINCT fsa.product_id) AS unique_products,
    SUM(fsa.allocated_qty) AS total_qty_allocated,
    SUM(
        wb.purchase_price * (fsa.allocated_qty / NULLIF(wb.received_qty, 0))
    ) AS total_value_allocated,
    SUM(
        CASE
            WHEN ii.discount_percent IS NOT NULL AND ii.discount_percent > 0 AND ii.discount_percent < 100
            THEN (ii.total_price / (1 - ii.discount_percent / 100.0))
                 * (fsa.allocated_qty / NULLIF(wb.received_qty, 0))
            ELSE wb.purchase_price * (fsa.allocated_qty / NULLIF(wb.received_qty, 0))
        END
    ) AS total_value_allocated_before_discount,
    MAX(fsa.allocation_date) AS last_allocation_date
FROM public.farms f
LEFT JOIN public.farm_stock_allocations fsa ON f.id = fsa.farm_id
LEFT JOIN public.warehouse_batches wb ON fsa.warehouse_batch_id = wb.id
LEFT JOIN LATERAL (
    SELECT ii0.total_price, ii0.discount_percent
    FROM public.invoice_items ii0
    WHERE ii0.warehouse_batch_id = wb.id
    ORDER BY ii0.line_no NULLS LAST, ii0.id
    LIMIT 1
) ii ON true
GROUP BY f.id, f.name, f.code
ORDER BY total_value_allocated DESC NULLS LAST;

COMMENT ON VIEW public.vw_allocation_analytics_by_farm IS 'Farm allocation analytics: value after discount (existing) and before discount (invoice line / sąskaitos logic)';
