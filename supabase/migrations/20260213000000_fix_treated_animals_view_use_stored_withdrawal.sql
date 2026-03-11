-- Fix vw_treated_animals_detailed to use stored withdrawal dates instead of recalculating
-- This allows manual overrides via ŽURNALAS to be reflected in the report
--
-- PROBLEM: The view was recalculating withdrawal dates on-the-fly:
--   withdrawal_until_meat = reg_date + product.withdrawal_days_meat
-- This ignored manual edits made via the Critical Data Editor (ŽURNALAS)
--
-- SOLUTION: Use the stored t.withdrawal_until_meat and t.withdrawal_until_milk values
-- These are automatically calculated by triggers, but can be manually overridden when needed
--
-- TO REVERT: Run migration 20260213000001_revert_treated_animals_view_to_calculated.sql

DROP VIEW IF EXISTS vw_treated_animals_detailed CASCADE;

CREATE OR REPLACE VIEW vw_treated_animals_detailed AS
-- Get medications from usage_items (immediate treatments)
SELECT 
    t.id AS treatment_id,
    t.animal_id,
    t.disease_id,
    
    -- Column 2: Registracijos data (Registration date)
    t.reg_date AS registration_date,
    
    -- Column 3: Gyvūno laikytojo duomenys (Owner/holder details)
    COALESCE(a.holder_name, 'ŽŪB Berčiūnai') AS owner_name,
    a.holder_address AS owner_address,
    
    -- Column 4: Gyvūno rūšis, lytis (Animal breed, sex)
    COALESCE(NULLIF(TRIM(a.breed), ''), a.species) AS species,
    a.sex,
    
    -- Column 5: Gyvūno amžius (Animal age)
    a.age_months,
    a.birth_date,
    
    -- Column 6: Gyvūno ženklinimo numeris (Animal tag/ID number)
    a.tag_no AS animal_tag,
    
    -- Column 7: Pirmųjų ligos požymių pastebėjimo data (First symptoms date)
    COALESCE(t.first_symptoms_date, t.reg_date) AS first_symptoms_date,
    
    -- Column 8: Gyvūno būklė (Animal condition/temperature)
    COALESCE(NULLIF(TRIM(t.animal_condition), ''), 'Patenkinama') AS animal_condition,
    
    -- Column 9: Atlikti tyrimai (Tests performed) - includes temperature from first visit
    CASE 
        -- Try to get temperature from the first visit in the chain
        WHEN EXISTS (
            SELECT 1 FROM animal_visits av 
            WHERE av.id = t.visit_id AND av.temperature IS NOT NULL
        ) THEN CONCAT('Temperatūra: ', (
            SELECT av.temperature 
            FROM animal_visits av 
            WHERE av.id = t.visit_id
        ), '°C')
        -- Try to get from related_visit_id (first visit in chain)
        WHEN EXISTS (
            SELECT 1 FROM animal_visits av 
            WHERE av.id = (
                SELECT av2.related_visit_id 
                FROM animal_visits av2 
                WHERE av2.id = t.visit_id
            ) AND av.temperature IS NOT NULL
        ) THEN CONCAT('Temperatūra: ', (
            SELECT av.temperature 
            FROM animal_visits av 
            WHERE av.id = (
                SELECT av2.related_visit_id 
                FROM animal_visits av2 
                WHERE av2.id = t.visit_id
            )
        ), '°C')
        -- Fallback to animal_condition if it's numeric
        WHEN t.animal_condition IS NOT NULL AND t.animal_condition ~ '^[0-9]+\.?[0-9]*$' 
        THEN CONCAT('Temperatūra: ', t.animal_condition, '°C')
        -- Default
        ELSE COALESCE(NULLIF(TRIM(t.tests), ''), 'Temperatūra')
    END AS tests,
    
    -- Column 10: Klinikinė diagnozė (Clinical diagnosis)
    t.clinical_diagnosis,
    COALESCE(
        d.name,
        NULLIF(TRIM(t.clinical_diagnosis), ''),
        'Nespecifikuota liga'
    ) AS disease_name,
    d.code AS disease_code,
    
    -- Column 11: Suteiktos veterinarijos paslaugos pavadinimas (Veterinary service provided)
    t.services,
    
    -- Medicine details (one per row)
    p.name AS medicine_name,
    ROUND(ui.qty::numeric, 2) AS medicine_dose,
    ui.unit AS medicine_unit,
    NULL AS medicine_days, -- Not applicable for immediate treatments
    
    -- Column 12: Išlauka (Withdrawal period)
    -- CHANGED: Use stored values from treatments table (respects manual ŽURNALAS overrides)
    t.withdrawal_until_meat,
    t.withdrawal_until_milk,
    p.withdrawal_days_meat,
    p.withdrawal_days_milk,
    
    -- Column 13: Ligos baigtis (Outcome)
    CASE
        WHEN t.outcome IS NOT NULL AND t.outcome != '' THEN t.outcome
        WHEN EXISTS (
            SELECT 1 FROM animal_visits av
            WHERE av.animal_id = t.animal_id
              AND av.visit_datetime > NOW()
              AND av.status IN ('Planuojamas', 'Suplanuota')
        ) THEN NULL
        ELSE 'Pasveiko'
    END AS treatment_outcome,
    
    -- Column 14: Veterinarijos gydytojo vardas, pavardė (Veterinarian name)
    -- ALWAYS "Artūras Abromaitis" for all rows
    'Artūras Abromaitis' AS veterinarian,
    
    -- Additional fields
    t.notes,
    t.created_at,
    'usage_item' AS source_type
    
FROM treatments t
LEFT JOIN animals a ON t.animal_id = a.id
LEFT JOIN diseases d ON t.disease_id = d.id
INNER JOIN usage_items ui ON ui.treatment_id = t.id
INNER JOIN products p ON ui.product_id = p.id

UNION ALL

-- Get medications from treatment_courses (owner-administered, multi-day)
SELECT 
    t.id AS treatment_id,
    t.animal_id,
    t.disease_id,
    
    -- Column 2: Registracijos data (Registration date)
    t.reg_date AS registration_date,
    
    -- Column 3: Gyvūno laikytojo duomenys (Owner/holder details)
    COALESCE(a.holder_name, 'ŽŪB Berčiūnai') AS owner_name,
    a.holder_address AS owner_address,
    
    -- Column 4: Gyvūno rūšis, lytis (Animal breed, sex)
    COALESCE(NULLIF(TRIM(a.breed), ''), a.species) AS species,
    a.sex,
    
    -- Column 5: Gyvūno amžius (Animal age)
    a.age_months,
    a.birth_date,
    
    -- Column 6: Gyvūno ženklinimo numeris (Animal tag/ID number)
    a.tag_no AS animal_tag,
    
    -- Column 7: Pirmųjų ligos požymių pastebėjimo data (First symptoms date)
    COALESCE(t.first_symptoms_date, t.reg_date) AS first_symptoms_date,
    
    -- Column 8: Gyvūno būklė (Animal condition/temperature)
    COALESCE(NULLIF(TRIM(t.animal_condition), ''), 'Patenkinama') AS animal_condition,
    
    -- Column 9: Atlikti tyrimai (Tests performed) - includes temperature from first visit
    CASE 
        -- Try to get temperature from the first visit in the chain
        WHEN EXISTS (
            SELECT 1 FROM animal_visits av 
            WHERE av.id = t.visit_id AND av.temperature IS NOT NULL
        ) THEN CONCAT('Temperatūra: ', (
            SELECT av.temperature 
            FROM animal_visits av 
            WHERE av.id = t.visit_id
        ), '°C')
        -- Try to get from related_visit_id (first visit in chain)
        WHEN EXISTS (
            SELECT 1 FROM animal_visits av 
            WHERE av.id = (
                SELECT av2.related_visit_id 
                FROM animal_visits av2 
                WHERE av2.id = t.visit_id
            ) AND av.temperature IS NOT NULL
        ) THEN CONCAT('Temperatūra: ', (
            SELECT av.temperature 
            FROM animal_visits av 
            WHERE av.id = (
                SELECT av2.related_visit_id 
                FROM animal_visits av2 
                WHERE av2.id = t.visit_id
            )
        ), '°C')
        -- Fallback to animal_condition if it's numeric
        WHEN t.animal_condition IS NOT NULL AND t.animal_condition ~ '^[0-9]+\.?[0-9]*$' 
        THEN CONCAT('Temperatūra: ', t.animal_condition, '°C')
        -- Default
        ELSE COALESCE(NULLIF(TRIM(t.tests), ''), 'Temperatūra')
    END AS tests,
    
    -- Column 10: Klinikinė diagnozė (Clinical diagnosis)
    t.clinical_diagnosis,
    COALESCE(
        d.name,
        NULLIF(TRIM(t.clinical_diagnosis), ''),
        'Nespecifikuota liga'
    ) AS disease_name,
    d.code AS disease_code,
    
    -- Column 11: Suteiktos veterinarijos paslaugos pavadinimas (Veterinary service provided)
    t.services,
    
    -- Medicine details (one per row)
    p.name AS medicine_name,
    ROUND(tc.daily_dose::numeric, 2) AS medicine_dose,
    tc.unit AS medicine_unit,
    tc.days AS medicine_days, -- Number of days for course
    
    -- Column 12: Išlauka (Withdrawal period)
    -- CHANGED: Use stored values from treatments table (respects manual ŽURNALAS overrides)
    t.withdrawal_until_meat,
    t.withdrawal_until_milk,
    p.withdrawal_days_meat,
    p.withdrawal_days_milk,
    
    -- Column 13: Ligos baigtis (Outcome)
    CASE
        WHEN t.outcome IS NOT NULL AND t.outcome != '' THEN t.outcome
        WHEN EXISTS (
            SELECT 1 FROM animal_visits av
            WHERE av.animal_id = t.animal_id
              AND av.visit_datetime > NOW()
              AND av.status IN ('Planuojamas', 'Suplanuota')
        ) THEN NULL
        ELSE 'Pasveiko'
    END AS treatment_outcome,
    
    -- Column 14: Veterinarijos gydytojo vardas, pavardė (Veterinarian name)
    -- ALWAYS "Artūras Abromaitis" for all rows
    'Artūras Abromaitis' AS veterinarian,
    
    -- Additional fields
    t.notes,
    t.created_at,
    'treatment_course' AS source_type
    
FROM treatments t
LEFT JOIN animals a ON t.animal_id = a.id
LEFT JOIN diseases d ON t.disease_id = d.id
INNER JOIN treatment_courses tc ON tc.treatment_id = t.id
INNER JOIN products p ON tc.product_id = p.id

-- Order by date and creation time (descending - newest first)
ORDER BY registration_date DESC, created_at DESC, medicine_name ASC;

-- Grant permissions
GRANT ALL ON vw_treated_animals_detailed TO anon;
GRANT ALL ON vw_treated_animals_detailed TO authenticated;
GRANT ALL ON vw_treated_animals_detailed TO service_role;

COMMENT ON VIEW vw_treated_animals_detailed IS 'Official GYDOMŲ GYVŪNŲ REGISTRACIJOS ŽURNALAS format. Multiple rows per treatment - one row per medication used. Uses stored withdrawal dates from treatments table to respect manual overrides via ŽURNALAS.';
