-- Check all treatments for cow LT000044228148
-- Run this in Supabase SQL Editor

-- First, find the animal ID
SELECT 
  id as animal_id,
  tag_no,
  collar_no
FROM animals 
WHERE tag_no = 'LT000044228148' OR collar_no = 507;

-- Then, find all treatments for this animal
SELECT 
  t.id as treatment_id,
  t.reg_date,
  t.withdrawal_until_meat,
  t.withdrawal_until_milk,
  t.clinical_diagnosis,
  d.name as disease_name,
  t.created_at,
  -- Count medications
  (SELECT COUNT(*) FROM usage_items WHERE treatment_id = t.id) as usage_items_count,
  (SELECT COUNT(*) FROM treatment_courses WHERE treatment_id = t.id) as courses_count
FROM treatments t
LEFT JOIN diseases d ON d.id = t.disease_id
WHERE t.animal_id = (SELECT id FROM animals WHERE tag_no = 'LT000044228148')
ORDER BY t.reg_date DESC, t.created_at DESC;

-- Show all medications for each treatment
SELECT 
  t.id as treatment_id,
  t.reg_date,
  t.withdrawal_until_meat,
  t.withdrawal_until_milk,
  p.name as product_name,
  ui.qty,
  ui.unit,
  p.withdrawal_days_meat,
  p.withdrawal_days_milk
FROM treatments t
JOIN usage_items ui ON ui.treatment_id = t.id
JOIN products p ON p.id = ui.product_id
WHERE t.animal_id = (SELECT id FROM animals WHERE tag_no = 'LT000044228148')
ORDER BY t.reg_date DESC, p.name;

-- Check what the view shows
SELECT 
  treatment_id,
  registration_date,
  product_name,
  dose,
  withdrawal_until_meat,
  withdrawal_until_milk,
  disease_name
FROM vw_treated_animals_detailed
WHERE animal_tag = 'LT000044228148'
  AND registration_date = '2026-02-14'
ORDER BY product_name;
