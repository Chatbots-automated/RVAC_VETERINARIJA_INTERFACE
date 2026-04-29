-- Check what the view returns for the most recent treatment
SELECT 
    registration_date,
    treatment_id,
    animal_tag,
    product_name,
    quantity_used,
    medication_source
FROM vw_treated_animals_detailed
WHERE treatment_id = (
    SELECT t.id 
    FROM treatments t
    WHERE t.created_at > NOW() - INTERVAL '10 minutes'
    ORDER BY t.created_at DESC
    LIMIT 1
)
ORDER BY registration_date, created_at;
