-- Debug script to check course_doses data for multi-day treatments
-- Find the most recent treatment course for animal LT000007848220

SELECT 
    t.id as treatment_id,
    t.reg_date,
    tc.id as course_id,
    tc.start_date,
    tc.total_days,
    cd.day_number,
    cd.scheduled_date,
    cd.administered_date,
    cd.dose_amount,
    cd.dose_unit,
    p.name as product_name
FROM treatments t
JOIN animals a ON t.animal_id = a.id
JOIN treatment_courses tc ON tc.treatment_id = t.id
JOIN course_doses cd ON cd.course_id = tc.id
LEFT JOIN batches b ON tc.batch_id = b.id
LEFT JOIN products p ON b.product_id = p.id
WHERE a.ear_tag = 'LT000007848220'
ORDER BY t.reg_date DESC, cd.day_number;
