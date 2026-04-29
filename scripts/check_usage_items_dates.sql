-- Check the most recent usage_items to see if administered_date is being set
SELECT 
    ui.id,
    ui.treatment_id,
    ui.administered_date,
    ui.qty,
    ui.created_at,
    t.reg_date,
    a.tag_no
FROM usage_items ui
JOIN treatments t ON ui.treatment_id = t.id
JOIN animals a ON t.animal_id = a.id
WHERE t.created_at > NOW() - INTERVAL '10 minutes'
ORDER BY ui.created_at DESC
LIMIT 10;
