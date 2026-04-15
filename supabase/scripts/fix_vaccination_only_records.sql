-- =====================================================================
-- Fix Vaccination-Only Records (Missing Treatments)
-- =====================================================================
-- Purpose: Create treatment records for vaccinations that don't have them,
-- so they show in GYDOMŲ GYVŪNŲ REGISTRAS and other treatment reports
-- =====================================================================

DO $$
DECLARE
    v_vaccination_record record;
    v_treatment_id uuid;
    v_fixed_count int := 0;
    v_total_vaccinations int := 0;
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'FIXING VACCINATION-ONLY RECORDS';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';

    -- Count vaccinations that don't have corresponding usage_items with treatment_id
    SELECT COUNT(*) INTO v_total_vaccinations
    FROM vaccinations v
    WHERE NOT EXISTS (
        SELECT 1 FROM usage_items ui 
        WHERE ui.vaccination_id = v.id 
        AND ui.treatment_id IS NOT NULL
    );

    RAISE NOTICE 'Found % vaccinations without linked treatments', v_total_vaccinations;
    RAISE NOTICE '';

    -- Loop through vaccinations without treatment records
    FOR v_vaccination_record IN 
        SELECT 
            v.id as vaccination_id,
            v.farm_id,
            v.animal_id,
            v.vaccination_date,
            v.product_id,
            v.batch_id,
            v.dose_amount,
            v.unit,
            v.administered_by,
            v.notes
        FROM vaccinations v
        WHERE NOT EXISTS (
            SELECT 1 FROM usage_items ui 
            WHERE ui.vaccination_id = v.id 
            AND ui.treatment_id IS NOT NULL
        )
        ORDER BY v.vaccination_date DESC
    LOOP
        -- Create treatment record
        INSERT INTO treatments (
            farm_id,
            reg_date,
            animal_id,
            vet_name,
            notes,
            clinical_diagnosis,
            animal_condition
        ) VALUES (
            v_vaccination_record.farm_id,
            v_vaccination_record.vaccination_date,
            v_vaccination_record.animal_id,
            v_vaccination_record.administered_by,
            v_vaccination_record.notes,
            'Vakcinavimas',
            'Patenkinama'
        )
        RETURNING id INTO v_treatment_id;

        -- Create usage_item linked to treatment
        INSERT INTO usage_items (
            farm_id,
            treatment_id,
            vaccination_id,
            product_id,
            batch_id,
            qty,
            unit,
            purpose,
            administered_date
        ) VALUES (
            v_vaccination_record.farm_id,
            v_treatment_id,
            v_vaccination_record.vaccination_id,
            v_vaccination_record.product_id,
            v_vaccination_record.batch_id,
            v_vaccination_record.dose_amount,
            v_vaccination_record.unit,
            'vaccination',
            v_vaccination_record.vaccination_date
        );

        -- Calculate withdrawal dates for the new treatment
        PERFORM calculate_withdrawal_dates(v_treatment_id);

        v_fixed_count := v_fixed_count + 1;

        -- Log progress every 50 records
        IF v_fixed_count % 50 = 0 THEN
            RAISE NOTICE '  Progress: % / % vaccinations processed...', v_fixed_count, v_total_vaccinations;
        END IF;
    END LOOP;

    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'FIX COMPLETE';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Total vaccinations: %', v_total_vaccinations;
    RAISE NOTICE 'Fixed (created treatments): %', v_fixed_count;
    RAISE NOTICE '========================================';

END $$;

-- Verification
SELECT 
    'Verification: Vaccinations now with treatments' as check_type,
    COUNT(*) as count
FROM vaccinations v
WHERE EXISTS (
    SELECT 1 FROM usage_items ui 
    WHERE ui.vaccination_id = v.id 
    AND ui.treatment_id IS NOT NULL
);

SELECT 
    'Verification: Vaccinations still without treatments' as check_type,
    COUNT(*) as count
FROM vaccinations v
WHERE NOT EXISTS (
    SELECT 1 FROM usage_items ui 
    WHERE ui.vaccination_id = v.id 
    AND ui.treatment_id IS NOT NULL
);
