-- Debug: Check what's in animal_visits for the multi-day course
SELECT 
    av.id,
    av.visit_datetime::date as visit_date,
    av.status,
    av.medications_processed,
    av.related_treatment_id,
    av.planned_medications
FROM animal_visits av
WHERE av.animal_id = (SELECT id FROM animals WHERE tag_no = 'LT000007848220')
ORDER BY av.visit_datetime;
