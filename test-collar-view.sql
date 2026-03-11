-- Test the vw_animal_latest_collar view

-- Check total count
SELECT COUNT(*) as total_animals_with_collars
FROM vw_animal_latest_collar;

-- Check if we're getting all animals
SELECT 
  (SELECT COUNT(*) FROM animals WHERE tag_no IS NOT NULL) as total_animals,
  (SELECT COUNT(*) FROM vw_animal_latest_collar) as animals_with_collars,
  (SELECT COUNT(DISTINCT ear_number) FROM gea_daily_cows_joined) as unique_ear_numbers_in_gea;

-- Show sample data
SELECT 
  animal_id,
  collar_no
FROM vw_animal_latest_collar
ORDER BY collar_no
LIMIT 20;

-- Check for duplicates (should be 0)
SELECT 
  animal_id,
  COUNT(*) as count
FROM vw_animal_latest_collar
GROUP BY animal_id
HAVING COUNT(*) > 1;
