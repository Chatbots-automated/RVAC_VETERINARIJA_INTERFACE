-- Fix vw_vet_drug_journal view to use qty_left instead of summing usage_items
-- This fixes negative stock display in the drug journal report

DROP VIEW IF EXISTS vw_vet_drug_journal;

CREATE OR REPLACE VIEW vw_vet_drug_journal AS
SELECT 
  b.id AS batch_id,
  b.product_id,
  b.created_at AS receipt_date,
  p.name AS product_name,
  p.registration_code,
  p.active_substance,
  s.name AS supplier_name,
  b.lot,
  b.batch_number,
  b.mfg_date AS manufacture_date,
  b.expiry_date,
  b.received_qty AS quantity_received,
  p.primary_pack_unit AS unit,
  -- FIXED: Use qty_left as source of truth (maintained by database triggers)
  -- instead of summing usage_items which may have historical discrepancies
  (b.received_qty - COALESCE(b.qty_left, 0)) AS quantity_used,
  COALESCE(b.qty_left, 0) AS quantity_remaining,
  b.doc_title,
  b.doc_number AS invoice_number,
  b.doc_date AS invoice_date
FROM batches b
JOIN products p ON b.product_id = p.id
LEFT JOIN suppliers s ON b.supplier_id = s.id
WHERE p.category IN ('medicines', 'prevention')
ORDER BY b.created_at DESC;

COMMENT ON VIEW vw_vet_drug_journal IS 'Veterinary drug journal view - uses qty_left from batches as source of truth for accurate stock levels';
