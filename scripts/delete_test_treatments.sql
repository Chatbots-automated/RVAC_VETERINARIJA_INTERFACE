-- =====================================================================
-- Delete Test Treatments and Return Stock
-- =====================================================================
-- Description: 
--   This script safely deletes treatments and returns stock to batches.
--   Use this for cleaning up test treatments.
-- 
-- IMPORTANT: 
--   - Replace the WHERE conditions to match your test treatments
--   - Review the SELECT queries first before running DELETE
--   - This cannot be undone!
-- =====================================================================

-- =====================================================================
-- STEP 1: REVIEW TREATMENTS TO DELETE
-- =====================================================================
-- Run this first to see what will be deleted

SELECT 
    t.id,
    t.reg_date,
    t.animal_id,
    a.tag_no,
    t.clinical_diagnosis,
    t.notes,
    t.vet_name,
    t.created_at
FROM treatments t
LEFT JOIN animals a ON a.id = t.animal_id
WHERE 
    -- Option 1: Delete by date range
    t.reg_date >= '2026-04-09'  -- Today or recent date
    
    -- Option 2: Delete by clinical diagnosis
    -- t.clinical_diagnosis ILIKE '%test%' OR t.clinical_diagnosis = 'Masinis gydymas'
    
    -- Option 3: Delete by vet name
    -- AND t.vet_name = 'Test Vet'
    
    -- Option 4: Delete by animal
    -- AND a.tag_no = 'LT123456'
    
ORDER BY t.created_at DESC;

-- =====================================================================
-- STEP 2: REVIEW STOCK THAT WILL BE RETURNED
-- =====================================================================
-- Run this to see what stock will be returned to batches

SELECT 
    t.id AS treatment_id,
    t.reg_date,
    a.tag_no,
    ui.id AS usage_item_id,
    p.name AS product_name,
    ui.batch_id,
    ui.qty AS qty_to_return,
    ui.unit,
    b.qty_left AS current_batch_qty,
    (b.qty_left + ui.qty) AS new_batch_qty
FROM treatments t
LEFT JOIN animals a ON a.id = t.animal_id
LEFT JOIN usage_items ui ON ui.treatment_id = t.id
LEFT JOIN products p ON p.id = ui.product_id
LEFT JOIN batches b ON b.id = ui.batch_id
WHERE 
    t.reg_date >= '2026-04-09'  -- Match the same condition as above
ORDER BY t.created_at DESC;

-- =====================================================================
-- STEP 3: RETURN STOCK TO BATCHES
-- =====================================================================
-- This returns the stock before deleting the records

DO $$
DECLARE
    v_usage_record RECORD;
    v_batch_record RECORD;
    v_returned_count INTEGER := 0;
BEGIN
    -- Loop through all usage_items for treatments to be deleted
    FOR v_usage_record IN 
        SELECT 
            ui.id,
            ui.batch_id,
            ui.qty,
            t.id AS treatment_id
        FROM usage_items ui
        INNER JOIN treatments t ON t.id = ui.treatment_id
        WHERE 
            t.reg_date >= '2026-04-09'  -- Match the same condition
            AND ui.batch_id IS NOT NULL
    LOOP
        -- Get current batch info
        SELECT qty_left, status INTO v_batch_record
        FROM batches
        WHERE id = v_usage_record.batch_id;
        
        IF FOUND THEN
            -- Calculate new quantity
            DECLARE
                v_new_qty_left NUMERIC;
                v_new_status TEXT;
            BEGIN
                v_new_qty_left := COALESCE(v_batch_record.qty_left, 0) + v_usage_record.qty;
                
                -- Update status if was depleted
                IF v_batch_record.status = 'depleted' AND v_new_qty_left > 0 THEN
                    v_new_status := 'active';
                ELSE
                    v_new_status := v_batch_record.status;
                END IF;
                
                -- Update the batch
                UPDATE batches
                SET 
                    qty_left = v_new_qty_left,
                    status = v_new_status,
                    updated_at = NOW()
                WHERE id = v_usage_record.batch_id;
                
                v_returned_count := v_returned_count + 1;
                
                RAISE NOTICE 'Returned % units to batch % (new qty: %)', 
                    v_usage_record.qty, 
                    v_usage_record.batch_id, 
                    v_new_qty_left;
            END;
        END IF;
    END LOOP;
    
    -- Also handle treatment_courses
    FOR v_usage_record IN 
        SELECT 
            tc.id,
            tc.batch_id,
            tc.total_dose AS qty,
            t.id AS treatment_id
        FROM treatment_courses tc
        INNER JOIN treatments t ON t.id = tc.treatment_id
        WHERE 
            t.reg_date >= '2026-04-09'  -- Match the same condition
            AND tc.batch_id IS NOT NULL
    LOOP
        -- Get current batch info
        SELECT qty_left, status INTO v_batch_record
        FROM batches
        WHERE id = v_usage_record.batch_id;
        
        IF FOUND THEN
            -- Calculate new quantity
            DECLARE
                v_new_qty_left NUMERIC;
                v_new_status TEXT;
            BEGIN
                v_new_qty_left := COALESCE(v_batch_record.qty_left, 0) + v_usage_record.qty;
                
                -- Update status if was depleted
                IF v_batch_record.status = 'depleted' AND v_new_qty_left > 0 THEN
                    v_new_status := 'active';
                ELSE
                    v_new_status := v_batch_record.status;
                END IF;
                
                -- Update the batch
                UPDATE batches
                SET 
                    qty_left = v_new_qty_left,
                    status = v_new_status,
                    updated_at = NOW()
                WHERE id = v_usage_record.batch_id;
                
                v_returned_count := v_returned_count + 1;
                
                RAISE NOTICE 'Returned % units to batch % from course (new qty: %)', 
                    v_usage_record.qty, 
                    v_usage_record.batch_id, 
                    v_new_qty_left;
            END;
        END IF;
    END LOOP;
    
    RAISE NOTICE 'Total stock items returned: %', v_returned_count;
END $$;

-- =====================================================================
-- STEP 4: DELETE RELATED RECORDS
-- =====================================================================
-- Delete in correct order to respect foreign key constraints

-- Delete course doses
DELETE FROM course_doses
WHERE course_id IN (
    SELECT tc.id
    FROM treatment_courses tc
    INNER JOIN treatments t ON t.id = tc.treatment_id
    WHERE t.reg_date >= '2026-04-09'
);

-- Delete treatment courses
DELETE FROM treatment_courses
WHERE treatment_id IN (
    SELECT id FROM treatments
    WHERE reg_date >= '2026-04-09'
);

-- Delete usage items
DELETE FROM usage_items
WHERE treatment_id IN (
    SELECT id FROM treatments
    WHERE reg_date >= '2026-04-09'
);

-- Delete treatment medications
DELETE FROM treatment_medications
WHERE treatment_id IN (
    SELECT id FROM treatments
    WHERE reg_date >= '2026-04-09'
);

-- Delete related animal visits if they only had treatment procedure
DELETE FROM animal_visits
WHERE id IN (
    SELECT visit_id FROM treatments
    WHERE reg_date >= '2026-04-09'
    AND visit_id IS NOT NULL
)
AND procedures = ARRAY['Gydymas']::text[];

-- =====================================================================
-- STEP 5: DELETE TREATMENTS
-- =====================================================================

DELETE FROM treatments
WHERE reg_date >= '2026-04-09';

-- =====================================================================
-- STEP 6: VERIFY DELETION
-- =====================================================================

-- Check remaining treatments
SELECT COUNT(*) AS remaining_treatments
FROM treatments
WHERE reg_date >= '2026-04-09';

-- Should return 0 if successful

-- =====================================================================
-- ALTERNATIVE: DELETE SPECIFIC TREATMENT BY ID
-- =====================================================================
-- If you want to delete just one specific treatment, use this instead:

/*
DO $$
DECLARE
    v_treatment_id UUID := 'your-treatment-id-here';
    v_usage_record RECORD;
    v_batch_record RECORD;
BEGIN
    -- Return stock from usage_items
    FOR v_usage_record IN 
        SELECT id, batch_id, qty
        FROM usage_items
        WHERE treatment_id = v_treatment_id
        AND batch_id IS NOT NULL
    LOOP
        SELECT qty_left, status INTO v_batch_record
        FROM batches WHERE id = v_usage_record.batch_id;
        
        IF FOUND THEN
            UPDATE batches
            SET 
                qty_left = COALESCE(qty_left, 0) + v_usage_record.qty,
                status = CASE 
                    WHEN status = 'depleted' AND (qty_left + v_usage_record.qty) > 0 
                    THEN 'active' 
                    ELSE status 
                END,
                updated_at = NOW()
            WHERE id = v_usage_record.batch_id;
            
            RAISE NOTICE 'Returned % units to batch %', v_usage_record.qty, v_usage_record.batch_id;
        END IF;
    END LOOP;
    
    -- Return stock from treatment_courses
    FOR v_usage_record IN 
        SELECT id, batch_id, total_dose AS qty
        FROM treatment_courses
        WHERE treatment_id = v_treatment_id
        AND batch_id IS NOT NULL
    LOOP
        SELECT qty_left, status INTO v_batch_record
        FROM batches WHERE id = v_usage_record.batch_id;
        
        IF FOUND THEN
            UPDATE batches
            SET 
                qty_left = COALESCE(qty_left, 0) + v_usage_record.qty,
                status = CASE 
                    WHEN status = 'depleted' AND (qty_left + v_usage_record.qty) > 0 
                    THEN 'active' 
                    ELSE status 
                END,
                updated_at = NOW()
            WHERE id = v_usage_record.batch_id;
            
            RAISE NOTICE 'Returned % units to batch % from course', v_usage_record.qty, v_usage_record.batch_id;
        END IF;
    END LOOP;
    
    -- Delete related records
    DELETE FROM course_doses WHERE course_id IN (SELECT id FROM treatment_courses WHERE treatment_id = v_treatment_id);
    DELETE FROM treatment_courses WHERE treatment_id = v_treatment_id;
    DELETE FROM usage_items WHERE treatment_id = v_treatment_id;
    DELETE FROM treatment_medications WHERE treatment_id = v_treatment_id;
    DELETE FROM treatments WHERE id = v_treatment_id;
    
    RAISE NOTICE 'Treatment % deleted successfully', v_treatment_id;
END $$;
*/

-- =====================================================================
-- NOTES
-- =====================================================================
-- 1. Always run STEP 1 and STEP 2 first to review what will be affected
-- 2. Adjust the WHERE conditions to match your test data
-- 3. The stock return happens automatically before deletion
-- 4. This script respects foreign key constraints
-- 5. Cannot be undone - make sure you're deleting the right treatments!
-- 6. For production use, consider adding a "is_test" flag to treatments
--    instead of deleting them
