-- =====================================================================
-- Add batch_number to vw_warehouse_inventory
-- =====================================================================
-- Created: 2026-06-22
-- Description:
--   The warehouse inventory view was missing batch_number (series number)
--   which is needed for reports. Clients want to see series number instead
--   of LOT in the warehouse stock report.
-- =====================================================================

DROP VIEW IF EXISTS public.vw_warehouse_inventory CASCADE;

CREATE OR REPLACE VIEW public.vw_warehouse_inventory AS
SELECT 
    wb.id AS warehouse_batch_id,
    wb.product_id,
    p.name AS product_name,
    p.category,
    p.primary_pack_unit AS unit,
    p.primary_pack_size,
    wb.lot,
    wb.batch_number,
    wb.serial_number,
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

COMMENT ON VIEW public.vw_warehouse_inventory IS 'Warehouse inventory with product details, batch numbers, and allocation status';

GRANT SELECT ON public.vw_warehouse_inventory TO authenticated;
