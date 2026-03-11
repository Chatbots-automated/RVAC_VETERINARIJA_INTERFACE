-- Find all usage of Dexa-Ject for cow LT000044228148 on 2026-02-14
-- This will show us what needs to be changed

-- Step 1: Find the animal ID
SELECT 
  id as animal_id,
  tag_no,
  collar_no
FROM animals 
WHERE tag_no = 'LT000044228148';

-- Step 2: Find the treatments on 2026-02-14
SELECT 
  t.id as treatment_id,
  t.reg_date,
  t.animal_id,
  d.name as disease_name,
  t.created_at
FROM treatments t
LEFT JOIN diseases d ON d.id = t.disease_id
WHERE t.animal_id = (SELECT id FROM animals WHERE tag_no = 'LT000044228148')
  AND t.reg_date = '2026-02-14'
ORDER BY t.created_at;

-- Step 3: Find Dexa-Ject product ID
SELECT 
  id as product_id,
  name,
  withdrawal_days_meat,
  withdrawal_days_milk
FROM products 
WHERE name ILIKE '%Dexa-Ject%';

-- Step 4: Find KETOPROCEN product ID
SELECT 
  id as product_id,
  name,
  withdrawal_days_meat,
  withdrawal_days_milk
FROM products 
WHERE name ILIKE '%KETOPROCEN%';

-- Step 5: Find all usage_items with Dexa-Ject for these treatments
SELECT 
  ui.id as usage_item_id,
  ui.treatment_id,
  t.reg_date,
  d.name as disease_name,
  p.name as product_name,
  ui.qty,
  ui.unit,
  ui.batch_id,
  b.lot as batch_lot
FROM usage_items ui
JOIN treatments t ON t.id = ui.treatment_id
LEFT JOIN diseases d ON d.id = t.disease_id
JOIN products p ON p.id = ui.product_id
LEFT JOIN batches b ON b.id = ui.batch_id
WHERE t.animal_id = (SELECT id FROM animals WHERE tag_no = 'LT000044228148')
  AND t.reg_date = '2026-02-14'
  AND p.name ILIKE '%Dexa-Ject%'
ORDER BY t.created_at, p.name;

-- Step 6: Check if there are any treatment_courses with Dexa-Ject
SELECT 
  tc.id as course_id,
  tc.treatment_id,
  t.reg_date,
  d.name as disease_name,
  p.name as product_name,
  tc.total_dose,
  tc.days,
  tc.unit
FROM treatment_courses tc
JOIN treatments t ON t.id = tc.treatment_id
LEFT JOIN diseases d ON d.id = t.disease_id
JOIN products p ON p.id = tc.product_id
WHERE t.animal_id = (SELECT id FROM animals WHERE tag_no = 'LT000044228148')
  AND t.reg_date = '2026-02-14'
  AND p.name ILIKE '%Dexa-Ject%'
ORDER BY t.created_at;
