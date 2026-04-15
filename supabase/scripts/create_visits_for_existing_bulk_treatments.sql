-- =====================================================================
-- Create Visits for Existing Bulk Treatments
-- =====================================================================
-- Purpose: Create animal_visits records for bulk treatments that don't have them
-- =====================================================================

DO $$
DECLARE
    v_treatment_record record;
    v_created_count int := 0;
    v_total_treatments int := 0;
    v_procedures text[];
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'CREATING VISITS FOR BULK TREATMENTS';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';

    -- Count treatments without visits
    SELECT COUNT(*) INTO v_total_treatments
    FROM treatments t
    WHERE NOT EXISTS (
        SELECT 1 FROM animal_visits av 
        WHERE av.related_treatment_id = t.id
    );

    RAISE NOTICE 'Found % treatments without visits', v_total_treatments;
    RAISE NOTICE '';

    -- Loop through treatments without visits
    FOR v_treatment_record IN 
        SELECT 
            t.id as treatment_id,
            t.farm_id,
            t.animal_id,
            t.reg_date,
            t.vet_name,
            t.notes,
            a.tag_no,
            CASE 
                WHEN EXISTS (
                    SELECT 1 FROM usage_items 
                    WHERE treatment_id = t.id AND purpose = 'treatment'
                ) THEN true 
                ELSE false 
            END as has_treatment,
            CASE 
                WHEN EXISTS (
                    SELECT 1 FROM usage_items 
                    WHERE treatment_id = t.id AND purpose = 'vaccination'
                ) THEN true 
                ELSE false 
            END as has_vaccination,
            CASE 
                WHEN EXISTS (
                    SELECT 1 FROM usage_items 
                    WHERE treatment_id = t.id AND purpose = 'prevention'
                ) THEN true 
                ELSE false 
            END as has_prevention
        FROM treatments t
        LEFT JOIN animals a ON a.id = t.animal_id
        WHERE NOT EXISTS (
            SELECT 1 FROM animal_visits av 
            WHERE av.related_treatment_id = t.id
        )
        ORDER BY t.reg_date DESC
    LOOP
        -- Build procedures array based on what was used
        v_procedures := ARRAY[]::text[];
        
        IF v_treatment_record.has_treatment THEN
            v_procedures := array_append(v_procedures, 'Gydymas');
        END IF;
        
        IF v_treatment_record.has_vaccination THEN
            v_procedures := array_append(v_procedures, 'Vakcina');
        END IF;
        
        IF v_treatment_record.has_prevention THEN
            v_procedures := array_append(v_procedures, 'Profilaktika');
        END IF;
        
        -- If no procedures found, default to 'Gydymas'
        IF array_length(v_procedures, 1) IS NULL THEN
            v_procedures := ARRAY['Gydymas'];
        END IF;

        -- Create visit
        INSERT INTO animal_visits (
            farm_id,
            animal_id,
            visit_datetime,
            procedures,
            status,
            notes,
            vet_name,
            treatment_required,
            related_treatment_id
        ) VALUES (
            v_treatment_record.farm_id,
            v_treatment_record.animal_id,
            v_treatment_record.reg_date::timestamp,
            v_procedures,
            'Užbaigtas',
            v_treatment_record.notes,
            v_treatment_record.vet_name,
            v_treatment_record.has_treatment,
            v_treatment_record.treatment_id
        );

        v_created_count := v_created_count + 1;

        -- Log progress every 50 visits
        IF v_created_count % 50 = 0 THEN
            RAISE NOTICE '  Progress: % / % visits created...', v_created_count, v_total_treatments;
        END IF;
    END LOOP;

    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'VISITS CREATION COMPLETE';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Total treatments: %', v_total_treatments;
    RAISE NOTICE 'Visits created: %', v_created_count;
    RAISE NOTICE '========================================';

END $$;

-- Verification
SELECT 
    'Verification: Treatments with visits' as check_type,
    COUNT(*) as count
FROM treatments t
WHERE EXISTS (
    SELECT 1 FROM animal_visits av 
    WHERE av.related_treatment_id = t.id
);

SELECT 
    'Verification: Treatments without visits' as check_type,
    COUNT(*) as count
FROM treatments t
WHERE NOT EXISTS (
    SELECT 1 FROM animal_visits av 
    WHERE av.related_treatment_id = t.id
);
