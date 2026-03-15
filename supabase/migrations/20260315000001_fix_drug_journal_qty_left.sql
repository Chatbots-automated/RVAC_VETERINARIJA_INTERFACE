-- =====================================================================
-- Fix Drug Journal View to Use qty_left Instead of Recalculating
-- =====================================================================
-- Migration: 20260315000001
-- Created: 2026-03-15
--
-- ISSUE: The drug journal report (ataskaitos tab) was showing different
-- remaining quantities than the inventory (atsargos tab) because it was
-- recalculating from usage_items instead of using the authoritative qty_left field.
--
-- EXAMPLE: TEST PRODUKTAS LOT 02112 showed:
--   - Drug journal: 91ml remaining (incorrect - calculated from SUM)
--   - Inventory: 89ml remaining (correct - from qty_left)
--   - Discrepancy: 2ml
--
-- ROOT CAUSE: The view was doing:
--   quantity_remaining = received_qty - SUM(usage_items.qty)
-- But should use:
--   quantity_remaining = qty_left (maintained by triggers)
--
-- FIX: Update vw_vet_drug_journal to use qty_left as the single source of truth
-- =====================================================================

DROP VIEW IF EXISTS public.vw_vet_drug_journal CASCADE;

CREATE OR REPLACE VIEW public.vw_vet_drug_journal AS
SELECT 
    b.farm_id,
    b.id AS batch_id,
    b.product_id,
    b.created_at AS receipt_date,
    p.name AS product_name,
    p.registration_code,
    p.active_substance,
    s.name AS supplier_name,
    b.lot AS batch_number,
    b.mfg_date AS manufacture_date,
    b.expiry_date,
    b.received_qty AS quantity_received,
    p.primary_pack_unit AS unit,
    (b.received_qty - b.qty_left) AS quantity_used,
    b.qty_left AS quantity_remaining,
    b.doc_number AS invoice_number,
    b.doc_date AS invoice_date,
    'Invoice' AS doc_title
FROM public.batches b
JOIN public.products p ON b.product_id = p.id
LEFT JOIN public.suppliers s ON b.supplier_id = s.id
WHERE p.category IN ('medicines', 'prevention')
ORDER BY b.created_at DESC;

COMMENT ON VIEW public.vw_vet_drug_journal IS 'Veterinary drug journal with batch tracking and usage calculations. Uses qty_left as single source of truth for remaining quantities.';
