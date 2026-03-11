-- Check for triggers on users table
SELECT 
    trigger_name,
    event_manipulation,
    action_statement,
    action_timing
FROM information_schema.triggers
WHERE event_object_table = 'users';

-- Check for functions that might modify full_name
SELECT 
    routine_name,
    routine_definition
FROM information_schema.routines
WHERE routine_definition ILIKE '%full_name%'
   OR routine_definition ILIKE '%lithuanize%'
   OR routine_definition ILIKE '%Aleksandras%';
