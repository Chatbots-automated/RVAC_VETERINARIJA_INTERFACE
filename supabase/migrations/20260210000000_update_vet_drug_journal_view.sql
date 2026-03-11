-- Update vw_vet_drug_journal to include doc_title and supplier name for the 2024 format
-- This matches the official VETERINARINIŲ VAISTŲ IR VAISTINIŲ PREPARATŲ APSKAITOS ŽURNALAS format
-- Real-time updates: When medicines are used in treatments, usage_items table is updated automatically,
-- and quantity_used/quantity_remaining are recalculated in this view

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
  -- Real-time calculation: Sums all medicine usage from treatments, vaccinations, etc.
  COALESCE(
    (SELECT SUM(ui.qty) 
     FROM usage_items ui 
     WHERE ui.batch_id = b.id), 
    0
  ) AS quantity_used,
  -- Real-time calculation: Remaining stock after all usage
  (b.received_qty - COALESCE(
    (SELECT SUM(ui.qty) 
     FROM usage_items ui 
     WHERE ui.batch_id = b.id), 
    0
  )) AS quantity_remaining,
  b.doc_title,
  b.doc_number AS invoice_number,
  b.doc_date AS invoice_date
FROM batches b
JOIN products p ON b.product_id = p.id
LEFT JOIN suppliers s ON b.supplier_id = s.id
WHERE p.category IN ('medicines', 'prevention')
ORDER BY b.created_at DESC;

-- Grant permissions
GRANT ALL ON vw_vet_drug_journal TO anon;
GRANT ALL ON vw_vet_drug_journal TO authenticated;
GRANT ALL ON vw_vet_drug_journal TO service_role;

COMMENT ON VIEW vw_vet_drug_journal IS 'Veterinary medicine and pharmaceutical products accounting journal - 2024 format. Updates in real-time as medicines are used in treatments (via usage_items table).';
