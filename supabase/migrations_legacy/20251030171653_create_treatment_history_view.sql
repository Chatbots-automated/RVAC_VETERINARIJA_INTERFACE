/*
  # Create Treatment History View

  1. New View
    - `treatment_history_view` - Comprehensive view of all treatments with related data
      - Treatment details (date, diagnosis, outcome)
      - Animal information (tag, species, owner)
      - Disease information
      - Products used with quantities
      - Veterinarian details
      - Withdrawal periods
      - Treatment course information
  
  2. Purpose
    - Provides a complete history of all treatments for easy viewing and verification
    - Similar to vaccination history but for treatments
    - Shows all treatments grouped by registration date
*/

CREATE OR REPLACE VIEW treatment_history_view AS
SELECT 
  t.id as treatment_id,
  t.reg_date,
  t.first_symptoms_date,
  t.animal_condition,
  t.tests,
  t.clinical_diagnosis,
  t.outcome,
  t.services,
  t.vet_name,
  t.notes,
  t.mastitis_teat,
  t.mastitis_type,
  t.syringe_count,
  t.withdrawal_until_meat,
  t.withdrawal_until_milk,
  t.created_at,
  
  -- Animal info
  a.id as animal_id,
  a.tag_no as animal_tag,
  a.species,
  a.holder_name as owner_name,
  
  -- Disease info
  d.id as disease_id,
  d.code as disease_code,
  d.name as disease_name,
  
  -- Aggregate products used
  (
    SELECT json_agg(
      json_build_object(
        'product_name', p.name,
        'quantity', ui.qty,
        'unit', ui.unit,
        'batch_lot', b.lot
      )
    )
    FROM usage_items ui
    LEFT JOIN products p ON ui.product_id = p.id
    LEFT JOIN batches b ON ui.batch_id = b.id
    WHERE ui.treatment_id = t.id
  ) as products_used,
  
  -- Treatment course info
  (
    SELECT json_agg(
      json_build_object(
        'course_id', tc.id,
        'product_name', p.name,
        'total_dose', tc.total_dose,
        'daily_dose', tc.daily_dose,
        'days', tc.days,
        'unit', tc.unit,
        'start_date', tc.start_date,
        'doses_administered', tc.doses_administered,
        'status', tc.status,
        'batch_lot', b.lot
      )
    )
    FROM treatment_courses tc
    LEFT JOIN products p ON tc.product_id = p.id
    LEFT JOIN batches b ON tc.batch_id = b.id
    WHERE tc.treatment_id = t.id
  ) as treatment_courses

FROM treatments t
LEFT JOIN animals a ON t.animal_id = a.id
LEFT JOIN diseases d ON t.disease_id = d.id
ORDER BY t.reg_date DESC, t.created_at DESC;
