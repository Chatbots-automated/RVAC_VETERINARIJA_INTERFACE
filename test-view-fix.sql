-- Test to verify the view shows data correctly

-- First, check what's in each individual table
SELECT 'ataskaita1' as table_name, COUNT(*) as row_count, array_agg(DISTINCT cow_number) as cow_numbers
FROM gea_daily_ataskaita1
UNION ALL
SELECT 'ataskaita2', COUNT(*), array_agg(DISTINCT cow_number)
FROM gea_daily_ataskaita2
UNION ALL
SELECT 'ataskaita3', COUNT(*), array_agg(DISTINCT cow_number)
FROM gea_daily_ataskaita3;

-- Now check the joined view
SELECT 
  'joined_view' as source,
  COUNT(*) as row_count,
  array_agg(DISTINCT cow_number) as cow_numbers
FROM gea_daily_cows_joined;

-- Show full data for LT000008564340
SELECT 
  cow_number,
  cow_state,
  lactation_days,
  genetic_worth,
  avg_milk_prod_weight,
  insemination_count
FROM gea_daily_cows_joined
WHERE cow_number = 'LT000008564340';
