-- Diagnose why GEA data isn't showing for LT000008564057

-- 1. Check if this animal exists in animals table
SELECT 
  'Animal in database' as check_type,
  id,
  tag_no,
  CASE 
    WHEN tag_no IS NULL THEN '❌ No tag_no'
    ELSE '✅ Has tag_no'
  END as status
FROM animals
WHERE id = '840fb44a-a67c-47e4-8328-5fd42935418b'
   OR tag_no = 'LT000008564057';

-- 2. Check if we have ANY data in GEA tables
SELECT 
  'Total imports' as metric,
  COUNT(*) as count
FROM gea_daily_imports
UNION ALL
SELECT 
  'Total cows in ataskaita1',
  COUNT(DISTINCT cow_number)
FROM gea_daily_ataskaita1
UNION ALL
SELECT 
  'Total cows in ataskaita2',
  COUNT(DISTINCT cow_number)
FROM gea_daily_ataskaita2
UNION ALL
SELECT 
  'Total cows in ataskaita3',
  COUNT(DISTINCT cow_number)
FROM gea_daily_ataskaita3
UNION ALL
SELECT 
  'Total cows in joined view',
  COUNT(DISTINCT cow_number)
FROM gea_daily_cows_joined;

-- 3. Check if LT000008564057 exists in any table
SELECT 'ataskaita1' as table_name, COUNT(*) as found
FROM gea_daily_ataskaita1
WHERE cow_number = 'LT000008564057'
UNION ALL
SELECT 'ataskaita2', COUNT(*)
FROM gea_daily_ataskaita2
WHERE cow_number = 'LT000008564057'
UNION ALL
SELECT 'ataskaita3', COUNT(*)
FROM gea_daily_ataskaita3
WHERE cow_number = 'LT000008564057'
UNION ALL
SELECT 'joined_view', COUNT(*)
FROM gea_daily_cows_joined
WHERE cow_number = 'LT000008564057';

-- 4. Show sample of cow_numbers we DO have (first 20)
SELECT 
  cow_number,
  cow_state,
  lactation_days
FROM gea_daily_cows_joined
ORDER BY cow_number
LIMIT 20;

-- 5. Check for similar cow numbers (maybe formatting issue?)
SELECT 
  cow_number,
  LENGTH(cow_number) as length,
  cow_state
FROM gea_daily_cows_joined
WHERE cow_number LIKE '%8564057%'
   OR cow_number LIKE '%564057%'
ORDER BY cow_number;

-- 6. Show latest import info
SELECT 
  id,
  created_at,
  count_ataskaita1,
  count_ataskaita2,
  count_ataskaita3
FROM gea_daily_imports
ORDER BY created_at DESC
LIMIT 5;
