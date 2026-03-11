-- Debug why synchronization button is greyed out for telycaites
-- Check cow LT000044232865 (collar 1017)

-- Check the animal details
SELECT 
    '=== ANIMAL DETAILS ===' as section;

SELECT 
    a.id,
    a.tag_no,
    a.collar_no,
    a.species,
    a.birth_date,
    EXTRACT(YEAR FROM AGE(a.birth_date)) * 12 + EXTRACT(MONTH FROM AGE(a.birth_date)) as age_months,
    a.active
FROM animals a
WHERE a.tag_no = 'LT000044232865' OR a.collar_no = '1017';

-- Check GEA status
SELECT 
    '=== GEA STATUS ===' as section;

SELECT 
    ear_number,
    cow_state,
    import_created_at,
    group_number
FROM gea_daily_cows_joined
WHERE ear_number = 'LT000044232865'
ORDER BY import_created_at DESC
LIMIT 5;

-- Check synchronization history
SELECT 
    '=== SYNCHRONIZATION HISTORY ===' as section;

SELECT 
    s.id,
    s.start_date,
    s.status,
    s.created_at,
    p.name as protocol_name,
    -- Count steps
    (SELECT COUNT(*) FROM synchronization_steps WHERE synchronization_id = s.id) as total_steps,
    (SELECT COUNT(*) FROM synchronization_steps WHERE synchronization_id = s.id AND completed = true) as completed_steps
FROM animal_synchronizations s
LEFT JOIN synchronization_protocols p ON p.id = s.protocol_id
WHERE s.animal_id = (SELECT id FROM animals WHERE tag_no = 'LT000044232865' OR collar_no = '1017' LIMIT 1)
ORDER BY s.created_at DESC;

-- Check if there's an Active sync blocking new ones
SELECT 
    '=== BLOCKING CHECK ===' as section;

SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM animal_synchronizations 
            WHERE animal_id = (SELECT id FROM animals WHERE tag_no = 'LT000044232865' LIMIT 1)
            AND status = 'Active'
        ) THEN '❌ BLOCKED - Has Active sync'
        WHEN EXISTS (
            SELECT 1 FROM animal_synchronizations 
            WHERE animal_id = (SELECT id FROM animals WHERE tag_no = 'LT000044232865' LIMIT 1)
            AND status = 'Completed'
        ) THEN '⚠️ Has Completed sync (should allow new one)'
        WHEN EXISTS (
            SELECT 1 FROM animal_synchronizations 
            WHERE animal_id = (SELECT id FROM animals WHERE tag_no = 'LT000044232865' LIMIT 1)
            AND status = 'Cancelled'
        ) THEN '✅ Has Cancelled sync (allows new one)'
        ELSE '✅ No sync history (allows new one)'
    END as button_status;
