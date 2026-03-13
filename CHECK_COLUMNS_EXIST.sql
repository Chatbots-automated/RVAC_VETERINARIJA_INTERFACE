-- =====================================================================
-- RUN THIS TO CHECK IF COLUMNS EXIST IN YOUR DATABASE
-- =====================================================================

-- 1. Check if created_by_user_id exists in treatments table
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'treatments' 
  AND column_name = 'created_by_user_id';

-- Expected: Should return 1 row with column_name = 'created_by_user_id'
-- If returns EMPTY = Column doesn't exist!

-- 2. Check if created_by_user_id exists in animal_visits table
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'animal_visits' 
  AND column_name = 'created_by_user_id';

-- Expected: Should return 1 row with column_name = 'created_by_user_id'
-- If returns EMPTY = Column doesn't exist!

-- 3. Check if created_by_user_id exists in vaccinations table
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'vaccinations' 
  AND column_name = 'created_by_user_id';

-- Expected: Should return 1 row with column_name = 'created_by_user_id'
-- If returns EMPTY = Column doesn't exist!

-- 4. Check ALL columns in treatments table
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'treatments'
ORDER BY ordinal_position;

-- This will show you ALL columns in the treatments table

-- 5. Check if users table has full_name column
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'users'
  AND column_name = 'full_name';

-- Expected: Should return 1 row with column_name = 'full_name'

-- 6. Check actual data in treatments to see what's there
SELECT 
  id,
  animal_id,
  reg_date,
  vet_name,
  created_by_user_id,
  created_at
FROM treatments 
ORDER BY created_at DESC 
LIMIT 5;

-- This will show the most recent 5 treatments
-- Check if created_by_user_id column exists and has values

-- 7. Check if the view exists and what it contains
SELECT 
  treatment_id,
  animal_tag,
  registration_date,
  veterinarian,
  medicine_name
FROM vw_treated_animals_detailed
ORDER BY registration_date DESC
LIMIT 5;

-- This will show if the view is working correctly
