-- =====================================================================
-- Quick Delete: Today's Treatments (Working Version)
-- =====================================================================
-- Deletes all treatments from today and returns stock
-- =====================================================================

-- Preview
SELECT 
    t.id,
    a.tag_no,
    t.clinical_diagnosis,
    t.vet_name,
    COUNT(DISTINCT ui.id) AS usage_items,
    COUNT(DISTINCT tc.id) AS courses
FROM treatments t
LEFT JOIN animals a ON a.id = t.animal_id
LEFT JOIN usage_items ui ON ui.treatment_id = t.id
LEFT JOIN treatment_courses tc ON tc.treatment_id = t.id
WHERE t.reg_date = CURRENT_DATE
GROUP BY t.id, a.tag_no, t.clinical_diagnosis, t.vet_name;

-- Delete and return stock
DO $$
DECLARE
    v_treatment_id UUID;
    v_deleted_count INTEGER := 0;
BEGIN
    FOR v_treatment_id IN 
        SELECT id FROM treatments WHERE reg_date = CURRENT_DATE
    LOOP
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
        
        -- Delete related records
        DELETE FROM course_doses WHERE course_id IN (SELECT id FROM treatment_courses WHERE treatment_id = v_treatment_id);
        DELETE FROM treatment_courses WHERE treatment_id = v_treatment_id;
        DELETE FROM usage_items WHERE treatment_id = v_treatment_id;
        DELETE FROM treatment_medications WHERE treatment_id = v_treatment_id;
        DELETE FROM treatments WHERE id = v_treatment_id;
        
        v_deleted_count := v_deleted_count + 1;
    END LOOP;
    
    RAISE NOTICE 'Deleted % treatments from today', v_deleted_count;
END $$;

-- Verify
SELECT COUNT(*) AS remaining_today FROM treatments WHERE reg_date = CURRENT_DATE;
