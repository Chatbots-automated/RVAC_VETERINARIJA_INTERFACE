-- Verify the sync batch splitting fix is correct

-- 1. Check the constraint definition
SELECT 
    '=== CONSTRAINT DEFINITION ===' as section;

SELECT 
    conname as constraint_name,
    pg_get_constraintdef(oid) as definition
FROM pg_constraint
WHERE conname = 'usage_items_source_check';

-- 2. Check if function was updated
SELECT 
    '=== FUNCTION CHECK ===' as section;

SELECT 
    CASE 
        WHEN pg_get_functiondef(oid) LIKE '%IF v_treatment_id IS NOT NULL THEN%'
        THEN '✅ Function has conditional usage_items creation'
        ELSE '❌ Function missing conditional check'
    END as result
FROM pg_proc 
WHERE proname = 'deduct_sync_step_medication';

-- 3. Test query: What happens when we complete a sync step?
SELECT 
    '=== SIMULATION ===' as section;

-- This simulates what the trigger will do
SELECT 
    'When sync step is completed:' as scenario,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM treatments t
            JOIN animal_visits v ON v.id = t.visit_id
            WHERE v.sync_step_id IS NOT NULL
            LIMIT 1
        )
        THEN '✅ Will create usage_items (has treatment_id)'
        ELSE '⚠️ Will skip usage_items (no treatment_id)'
    END as behavior;

-- 4. Check recent sync steps
SELECT 
    '=== RECENT SYNC STEPS ===' as section;

SELECT 
    ss.id,
    ss.step_number,
    ss.completed,
    ss.dosage,
    ss.dosage_unit,
    p.name as product,
    -- Check if has treatment
    EXISTS (
        SELECT 1 FROM treatments t
        JOIN animal_visits v ON v.id = t.visit_id
        WHERE v.sync_step_id = ss.id
    ) as has_treatment
FROM synchronization_steps ss
LEFT JOIN products p ON p.id = ss.medication_product_id
WHERE ss.created_at >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY ss.created_at DESC
LIMIT 10;
