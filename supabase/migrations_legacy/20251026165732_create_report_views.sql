/*
  # Create Report Views

  Creates database views for regulatory compliance reports:
  
  1. Views Created
    - `vw_vet_drug_journal` - Veterinary drug receipt and usage journal
    - `vw_treated_animals` - Register of treated animals with full treatment details
    - `vw_owner_admin_meds` - Owner-administered medications log
    - `vw_biocide_journal` - Biocide usage journal
    - `vw_medical_waste` - Medical waste generation and disposal log
  
  2. Purpose
    - Provides formatted data for regulatory compliance reports
    - Combines data from multiple tables for comprehensive reporting
    - Ensures proper audit trail for veterinary activities
  
  3. Key Features
    - All views include relevant identifiers and dates
    - Product, supplier, and animal information joined
    - Proper formatting for export to CSV
    - Supports date range filtering
*/

-- Veterinary Drug Journal View
-- Tracks all drug receipts and usage by batch
CREATE OR REPLACE VIEW vw_vet_drug_journal AS
SELECT 
    b.id as batch_id,
    b.created_at as receipt_date,
    p.name as product_name,
    p.registration_code,
    p.active_substance,
    s.name as supplier_name,
    b.lot as batch_number,
    b.mfg_date as manufacture_date,
    b.expiry_date,
    b.received_qty as quantity_received,
    p.primary_pack_unit as unit,
    COALESCE(
        (SELECT SUM(ui.qty) 
         FROM usage_items ui 
         WHERE ui.batch_id = b.id), 
        0
    ) as quantity_used,
    b.received_qty - COALESCE(
        (SELECT SUM(ui.qty) 
         FROM usage_items ui 
         WHERE ui.batch_id = b.id), 
        0
    ) as quantity_remaining,
    b.doc_number as invoice_number,
    b.doc_date as invoice_date
FROM batches b
JOIN products p ON b.product_id = p.id
LEFT JOIN suppliers s ON b.supplier_id = s.id
WHERE p.category IN ('medicines', 'prevention')
ORDER BY b.created_at DESC;

-- Treated Animals Register View
-- Complete log of all animal treatments
CREATE OR REPLACE VIEW vw_treated_animals AS
SELECT 
    t.id as treatment_id,
    t.reg_date as registration_date,
    a.tag_no as animal_tag,
    a.species,
    a.holder_name as owner_name,
    a.holder_address as owner_address,
    d.name as disease_name,
    d.code as disease_code,
    t.clinical_diagnosis,
    t.animal_condition,
    t.first_symptoms_date,
    STRING_AGG(DISTINCT p.name, ', ') as products_used,
    t.withdrawal_until_meat,
    t.withdrawal_until_milk,
    t.outcome as treatment_outcome,
    t.vet_name as veterinarian,
    t.notes
FROM treatments t
LEFT JOIN animals a ON t.animal_id = a.id
LEFT JOIN diseases d ON t.disease_id = d.id
LEFT JOIN usage_items ui ON ui.treatment_id = t.id
LEFT JOIN products p ON ui.product_id = p.id
GROUP BY 
    t.id, t.reg_date, a.tag_no, a.species, a.holder_name, a.holder_address,
    d.name, d.code, t.clinical_diagnosis, t.animal_condition, 
    t.first_symptoms_date, t.withdrawal_until_meat, t.withdrawal_until_milk,
    t.outcome, t.vet_name, t.notes
ORDER BY t.reg_date DESC;

-- Owner-Administered Medications View
-- Log of medications given by owners under vet prescription
CREATE OR REPLACE VIEW vw_owner_admin_meds AS
SELECT 
    tc.id as course_id,
    t.reg_date as prescription_date,
    tc.start_date as first_admin_date,
    a.tag_no as animal_tag,
    a.species,
    a.holder_name as owner_name,
    p.name as product_name,
    p.registration_code,
    tc.daily_dose,
    tc.unit,
    tc.days as treatment_days,
    tc.total_dose,
    tc.doses_administered,
    tc.status as course_status,
    d.name as disease_name,
    t.vet_name as prescribing_vet,
    b.lot as batch_number,
    b.expiry_date as batch_expiry
FROM treatment_courses tc
JOIN treatments t ON tc.treatment_id = t.id
LEFT JOIN animals a ON t.animal_id = a.id
JOIN products p ON tc.product_id = p.id
LEFT JOIN diseases d ON t.disease_id = d.id
LEFT JOIN batches b ON tc.batch_id = b.id
ORDER BY tc.start_date DESC;

-- Biocide Journal View
-- Record of all biocide applications
CREATE OR REPLACE VIEW vw_biocide_journal AS
SELECT 
    bu.id as entry_id,
    bu.use_date,
    p.name as biocide_name,
    p.registration_code,
    p.active_substance,
    bu.purpose,
    bu.work_scope,
    bu.qty as quantity_used,
    bu.unit,
    b.lot as batch_number,
    b.expiry_date as batch_expiry,
    bu.used_by_name as applied_by,
    bu.created_at as logged_at
FROM biocide_usage bu
JOIN products p ON bu.product_id = p.id
LEFT JOIN batches b ON bu.batch_id = b.id
WHERE p.category = 'biocide'
ORDER BY bu.use_date DESC;

-- Medical Waste Journal View
-- Tracking of medical waste generation and disposal
CREATE OR REPLACE VIEW vw_medical_waste AS
SELECT 
    mw.id as entry_id,
    mw.waste_code,
    mw.name as waste_type,
    mw.period as reporting_period,
    mw.date as record_date,
    mw.qty_generated as quantity_generated,
    mw.qty_transferred as quantity_transferred,
    mw.carrier as waste_carrier,
    mw.processor as waste_processor,
    mw.transfer_date,
    mw.doc_no as transfer_document,
    mw.responsible as responsible_person,
    mw.created_at as logged_at
FROM medical_waste mw
ORDER BY mw.date DESC;
