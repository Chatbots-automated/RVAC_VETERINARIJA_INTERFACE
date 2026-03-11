-- Run these queries in Supabase SQL Editor to check your GEA data

-- 1. Check if tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name LIKE 'gea_daily%'
ORDER BY table_name;

-- 2. Check if view exists
SELECT table_name 
FROM information_schema.views 
WHERE table_schema = 'public' 
  AND table_name = 'gea_daily_cows_joined';

-- 3. Check if RPC function exists
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'gea_daily_upload';

-- 4. Check import count
SELECT COUNT(*) as import_count, MAX(created_at) as last_import
FROM gea_daily_imports;

-- 5. Check data in each ataskaita table
SELECT 'ataskaita1' as table_name, COUNT(*) as row_count FROM gea_daily_ataskaita1
UNION ALL
SELECT 'ataskaita2', COUNT(*) FROM gea_daily_ataskaita2
UNION ALL
SELECT 'ataskaita3', COUNT(*) FROM gea_daily_ataskaita3;

-- 6. Check joined view data
SELECT COUNT(*) as total_cows, 
       COUNT(DISTINCT cow_number) as unique_cows,
       MAX(import_created_at) as latest_import
FROM gea_daily_cows_joined;

-- 7. List all cow numbers in the new system
SELECT DISTINCT cow_number 
FROM gea_daily_cows_joined 
ORDER BY cow_number
LIMIT 20;

-- 8. Compare with animals table
SELECT a.tag_no, a.id,
       CASE 
         WHEN g.cow_number IS NOT NULL THEN '✅ Has new GEA data'
         ELSE '❌ No new GEA data'
       END as status
FROM animals a
LEFT JOIN (
  SELECT DISTINCT cow_number 
  FROM gea_daily_cows_joined
) g ON a.tag_no = g.cow_number
WHERE a.tag_no IS NOT NULL
ORDER BY a.tag_no
LIMIT 20;
