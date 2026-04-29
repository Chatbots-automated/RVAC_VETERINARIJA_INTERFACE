-- Test if we can directly select registration_date
SELECT 
    animal_tag,
    registration_date,
    treatment_id,
    product_name
FROM vw_treated_animals_detailed
WHERE treatment_id = '1294546b-f949-4be6-a8bf-3c61a51373ee'
ORDER BY registration_date
LIMIT 5;
