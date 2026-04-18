-- =====================================================================
-- Safe Delete Today's Treatments with Full Cleanup
-- =====================================================================
-- This version handles ALL related records and foreign keys
-- =====================================================================

-- STEP 1: Preview
SELECT 
    t.id,
    t.reg_date,
    a.tag_no,
    t.clinical_diagnosis,
    (SELECT COUNT(*) FROM usage_items WHERE treatment_id = t.id) AS usage_items,
    (SELECT COUNT(*) FROM treatment_courses WHERE treatment_id = t.id) AS courses,
    (SELECT COUNT(*) FROM animal_visits WHERE related_treatment_id = t.id) AS related_visits
FROM treatments t
LEFT JOIN animals a ON a.id = t.animal_id
WHERE t.reg_date = CURRENT_DATE
ORDER BY t.created_at DESC;

-- STEP 2: DELETE WITH FULL CLEANUP
DO $$
DECLARE
    v_treatment_id UUID;
    v_deleted_count INTEGER := 0;
BEGIN
    FOR v_treatment_id IN 
        SELECT id FROM treatments WHERE reg_date = CURRENT_DATE
    LOOP
        RAISE NOTICE 'Processing treatment: %', v_treatment_id;
        
        -- Return stock from usage_items
        UPDATE batches b
        SET 
            qty_left = b.qty_left + ui.qty,
            status = CASE 
                WHEN b.status = 'depleted' AND (b.qty_left + ui.qty) > 0 
                THEN 'active' 
                ELSE b.status 
            END,
            updated_at = NOW()
        FROM usage_items ui
        WHERE ui.batch_id = b.id
        AND ui.treatment_id = v_treatment_id;
        
        -- Return stock from treatment_courses
        UPDATE batches b
        SET 
            qty_left = b.qty_left + tc.total_dose,
            status = CASE 
                WHEN b.status = 'depleted' AND (b.qty_left + tc.total_dose) > 0 
                THEN 'active' 
                ELSE b.status 
            END,
            updated_at = NOW()
        FROM treatment_courses tc
        WHERE tc.batch_id = b.id
        AND tc.treatment_id = v_treatment_id
        AND tc.batch_id IS NOT NULL;
        
        -- Delete related animal_visits that reference this treatment
        DELETE FROM animal_visits
        WHERE related_treatment_id = v_treatment_id;
        
        -- Delete course_doses
        DELETE FROM course_doses 
        WHERE course_id IN (
            SELECT id FROM treatment_courses WHERE treatment_id = v_treatment_id
        );
        
        -- Delete course_medication_schedules
        DELETE FROM course_medication_schedules
        WHERE course_id IN (
            SELECT id FROM treatment_courses WHERE treatment_id = v_treatment_id
        );
        
        -- Delete treatment_courses
        DELETE FROM treatment_courses WHERE treatment_id = v_treatment_id;
        
        -- Delete usage_items
        DELETE FROM usage_items WHERE treatment_id = v_treatment_id;
        
        -- Delete the treatment itself
        DELETE FROM treatments WHERE id = v_treatment_id;
        
        v_deleted_count := v_deleted_count + 1;
        RAISE NOTICE 'Deleted treatment % successfully', v_treatment_id;
    END LOOP;
    
    RAISE NOTICE 'Total deleted: % treatments', v_deleted_count;
END $$;

-- STEP 3: Verify
SELECT 
    'After deletion' AS status,
    COUNT(*) AS remaining_treatments
FROM treatments 
WHERE reg_date = CURRENT_DATE;
