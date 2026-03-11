-- Check GEA status for telycaites (heifers)
-- Specifically check cow LT000044232865 (collar 1017)

-- Check the specific cow mentioned
SELECT 
    a.id,
    a.tag_no,
    a.collar_no,
    a.species,
    a.birth_date,
    a.age_months,
    -- Get latest GEA status
    (SELECT cow_state 
     FROM gea_daily_cows_joined 
     WHERE ear_number = a.tag_no 
     ORDER BY import_created_at DESC 
     LIMIT 1) as gea_status,
    -- Check if has active synchronization
    EXISTS (
        SELECT 1 FROM animal_synchronizations 
        WHERE animal_id = a.id 
        AND status IN ('Active', 'Pending')
    ) as has_active_sync
FROM animals a
WHERE a.tag_no = 'LT000044232865' OR a.collar_no = '1017';

-- Check all telycaites and their GEA statuses
SELECT 
    '=== ALL TELYCAITES (HEIFERS) ===' as section;

SELECT 
    a.tag_no,
    a.collar_no,
    a.age_months,
    (SELECT cow_state 
     FROM gea_daily_cows_joined 
     WHERE ear_number = a.tag_no 
     ORDER BY import_created_at DESC 
     LIMIT 1) as gea_status,
    -- Check if has active synchronization
    EXISTS (
        SELECT 1 FROM animal_synchronizations 
        WHERE animal_id = a.id 
        AND status IN ('Active', 'Pending')
    ) as has_active_sync
FROM animals a
WHERE a.species ILIKE '%telyč%'
    AND a.active = true
ORDER BY a.age_months DESC
LIMIT 20;

-- Check what GEA statuses exist for telycaites
SELECT 
    '=== GEA STATUSES FOR TELYCAITES ===' as section;

SELECT 
    gea.cow_state as gea_status,
    COUNT(DISTINCT a.id) as count
FROM animals a
LEFT JOIN gea_daily_cows_joined gea ON gea.ear_number = a.tag_no
WHERE a.species ILIKE '%telyč%'
    AND a.active = true
    AND gea.cow_state IS NOT NULL
GROUP BY gea.cow_state
ORDER BY count DESC;
