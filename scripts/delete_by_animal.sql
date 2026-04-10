-- =====================================================================
-- Delete Treatments for Specific Animal
-- =====================================================================
-- Use this to delete all treatments for a specific test animal
-- =====================================================================

-- STEP 1: Set the animal tag number here
DO $$
DECLARE
    v_animal_tag TEXT := 'LT123456';  -- ⚠️ CHANGE THIS to your animal's tag number
    v_animal_id UUID;
    v_treatment_id UUID;
    v_deleted_count INTEGER := 0;
BEGIN
    -- Get animal ID
    SELECT id INTO v_animal_id
    FROM animals
    WHERE tag_no = v_animal_tag;
    
    IF v_animal_id IS NULL THEN
        RAISE EXCEPTION 'Animal with tag % not found', v_animal_tag;
    END IF;
    
    RAISE NOTICE 'Found animal % (ID: %)', v_animal_tag, v_animal_id;
    
    -- Loop through each treatment for this animal
    FOR v_treatment_id IN 
        SELECT id FROM treatments WHERE animal_id = v_animal_id
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
        AND ui.treatment_id = v_treatment_id
        AND ui.batch_id IS NOT NULL;
        
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
        
        -- Delete the treatment
        DELETE FROM treatments WHERE id = v_treatment_id;
        
        v_deleted_count := v_deleted_count + 1;
        RAISE NOTICE 'Deleted treatment %', v_treatment_id;
    END LOOP;
    
    RAISE NOTICE 'Deleted % treatments for animal % and returned stock', v_deleted_count, v_animal_tag;
END $$;

-- Verify
-- SELECT COUNT(*) FROM treatments WHERE animal_id = (SELECT id FROM animals WHERE tag_no = 'LT123456');
