-- Debug: Check what vw_treated_animals_detailed returns for this animal
SELECT 
    registration_date,
    animal_tag,
    product_name,
    quantity_used,
    medication_source,
    treatment_id
FROM vw_treated_animals_detailed
WHERE animal_tag = 'LT000007848220'
ORDER BY registration_date, created_at;
