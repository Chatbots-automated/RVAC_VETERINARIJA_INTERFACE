-- Check what cow_numbers are actually in the GEA system

-- Show all unique cow_numbers in the joined view
SELECT 
  cow_number,
  cow_state,
  lactation_days,
  COUNT(*) as occurrences
FROM gea_daily_cows_joined
GROUP BY cow_number, cow_state, lactation_days
ORDER BY cow_number
LIMIT 50;

-- Show total count
SELECT COUNT(DISTINCT cow_number) as total_unique_cows
FROM gea_daily_cows_joined;

-- Check if the specific cow exists
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM gea_daily_cows_joined WHERE cow_number = 'LT000008564057') 
    THEN '✅ LT000008564057 EXISTS'
    ELSE '❌ LT000008564057 NOT FOUND'
  END as status_057,
  CASE 
    WHEN EXISTS (SELECT 1 FROM gea_daily_cows_joined WHERE cow_number = 'LT000008564340') 
    THEN '✅ LT000008564340 EXISTS'
    ELSE '❌ LT000008564340 NOT FOUND'
  END as status_340;

-- Show data for LT000008564057 if it exists
SELECT *
FROM gea_daily_cows_joined
WHERE cow_number = 'LT000008564057';
