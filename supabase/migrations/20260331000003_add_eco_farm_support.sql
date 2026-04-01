-- Add is_eco_farm column to farms table
ALTER TABLE public.farms ADD COLUMN IF NOT EXISTS is_eco_farm boolean DEFAULT false NOT NULL;

COMMENT ON COLUMN public.farms.is_eco_farm IS 'Eco-farm flag: withdrawal periods are doubled (0 days becomes 2 days, others are multiplied by 2)';

-- Update withdrawal report view to show ALL treatments and apply eco-farm logic
DROP VIEW IF EXISTS public.vw_withdrawal_report CASCADE;

CREATE OR REPLACE VIEW public.vw_withdrawal_report AS
SELECT 
    t.farm_id,
    f.name AS farm_name,
    f.code AS farm_code,
    f.is_eco_farm,
    t.id AS treatment_id,
    t.animal_id,
    a.tag_no AS animal_tag,
    a.species,
    a.sex,
    t.reg_date AS treatment_date,
    -- Original withdrawal dates
    t.withdrawal_until_meat AS withdrawal_until_meat_original,
    t.withdrawal_until_milk AS withdrawal_until_milk_original,
    -- Eco-farm adjusted withdrawal dates (date field)
    CASE 
        WHEN f.is_eco_farm AND t.withdrawal_until_meat IS NOT NULL THEN
            CASE 
                WHEN t.withdrawal_until_meat >= CURRENT_DATE THEN
                    CASE 
                        WHEN (t.withdrawal_until_meat - CURRENT_DATE) = 0 
                        THEN (CURRENT_DATE + INTERVAL '2 days')::date
                        ELSE (t.reg_date + ((t.withdrawal_until_meat - t.reg_date) * 2) * INTERVAL '1 day')::date
                    END
                ELSE (CURRENT_DATE + INTERVAL '2 days')::date
            END
        ELSE t.withdrawal_until_meat
    END AS withdrawal_until_meat,
    CASE 
        WHEN f.is_eco_farm AND t.withdrawal_until_milk IS NOT NULL THEN
            CASE 
                WHEN t.withdrawal_until_milk >= CURRENT_DATE THEN
                    CASE 
                        WHEN (t.withdrawal_until_milk - CURRENT_DATE) = 0 
                        THEN (CURRENT_DATE + INTERVAL '2 days')::date
                        ELSE (t.reg_date + ((t.withdrawal_until_milk - t.reg_date) * 2) * INTERVAL '1 day')::date
                    END
                ELSE (CURRENT_DATE + INTERVAL '2 days')::date
            END
        ELSE t.withdrawal_until_milk
    END AS withdrawal_until_milk,
    -- Eco-farm adjusted withdrawal days (calculated from adjusted dates)
    CASE 
        WHEN f.is_eco_farm AND t.withdrawal_until_meat IS NOT NULL THEN
            CASE 
                WHEN t.withdrawal_until_meat >= CURRENT_DATE THEN
                    CASE 
                        WHEN (t.withdrawal_until_meat - CURRENT_DATE) = 0 THEN 2
                        ELSE (t.withdrawal_until_meat - CURRENT_DATE) * 2
                    END
                ELSE 2
            END
        ELSE
            CASE 
                WHEN t.withdrawal_until_meat IS NOT NULL AND t.withdrawal_until_meat >= CURRENT_DATE 
                THEN (t.withdrawal_until_meat - CURRENT_DATE)
                ELSE 0
            END
    END AS withdrawal_days_meat,
    CASE 
        WHEN f.is_eco_farm AND t.withdrawal_until_milk IS NOT NULL THEN
            CASE 
                WHEN t.withdrawal_until_milk >= CURRENT_DATE THEN
                    CASE 
                        WHEN (t.withdrawal_until_milk - CURRENT_DATE) = 0 THEN 2
                        ELSE (t.withdrawal_until_milk - CURRENT_DATE) * 2
                    END
                ELSE 2
            END
        ELSE
            CASE 
                WHEN t.withdrawal_until_milk IS NOT NULL AND t.withdrawal_until_milk >= CURRENT_DATE 
                THEN (t.withdrawal_until_milk - CURRENT_DATE)
                ELSE 0
            END
    END AS withdrawal_days_milk,
    COALESCE(d.name, t.clinical_diagnosis, 'Nenurodyta') AS disease_name,
    t.vet_name AS veterinarian,
    t.notes,
    (
        SELECT string_agg(DISTINCT p.name, ', ')
        FROM public.usage_items ui
        JOIN public.products p ON ui.product_id = p.id
        WHERE ui.treatment_id = t.id
    ) AS medicines_used,
    t.created_at,
    t.updated_at
FROM public.treatments t
JOIN public.farms f ON t.farm_id = f.id
LEFT JOIN public.animals a ON t.animal_id = a.id
LEFT JOIN public.diseases d ON t.disease_id = d.id
WHERE 
    -- Show ALL treatments that have withdrawal periods (even if expired)
    t.withdrawal_until_meat IS NOT NULL OR t.withdrawal_until_milk IS NOT NULL
ORDER BY 
    f.name ASC,
    GREATEST(
        COALESCE(t.withdrawal_until_meat, '1900-01-01'::date),
        COALESCE(t.withdrawal_until_milk, '1900-01-01'::date)
    ) DESC;

COMMENT ON VIEW public.vw_withdrawal_report IS 'All animals with withdrawal periods (karencija) - per farm. Includes eco-farm logic: 0 days becomes 2, others are multiplied by 2';

-- Update all-farms withdrawal journal view with eco-farm logic
DROP VIEW IF EXISTS public.vw_withdrawal_journal_all_farms CASCADE;

CREATE OR REPLACE VIEW public.vw_withdrawal_journal_all_farms AS
SELECT 
    t.farm_id,
    f.name AS farm_name,
    f.code AS farm_code,
    f.is_eco_farm,
    t.id AS treatment_id,
    t.animal_id,
    a.tag_no AS animal_tag,
    a.species,
    a.sex,
    a.birth_date,
    EXTRACT(YEAR FROM AGE(CURRENT_DATE, a.birth_date::date)) AS age_years,
    a.holder_name AS owner_name,
    a.holder_address AS owner_address,
    t.reg_date AS treatment_date,
    -- Original withdrawal dates
    t.withdrawal_until_meat AS withdrawal_until_meat_original,
    t.withdrawal_until_milk AS withdrawal_until_milk_original,
    -- Eco-farm adjusted withdrawal dates (date field)
    CASE 
        WHEN f.is_eco_farm AND t.withdrawal_until_meat IS NOT NULL THEN
            CASE 
                WHEN t.withdrawal_until_meat >= CURRENT_DATE THEN
                    CASE 
                        WHEN (t.withdrawal_until_meat - CURRENT_DATE) = 0 
                        THEN (CURRENT_DATE + INTERVAL '2 days')::date
                        ELSE (t.reg_date + ((t.withdrawal_until_meat - t.reg_date) * 2) * INTERVAL '1 day')::date
                    END
                ELSE (CURRENT_DATE + INTERVAL '2 days')::date
            END
        ELSE t.withdrawal_until_meat
    END AS withdrawal_until_meat,
    CASE 
        WHEN f.is_eco_farm AND t.withdrawal_until_milk IS NOT NULL THEN
            CASE 
                WHEN t.withdrawal_until_milk >= CURRENT_DATE THEN
                    CASE 
                        WHEN (t.withdrawal_until_milk - CURRENT_DATE) = 0 
                        THEN (CURRENT_DATE + INTERVAL '2 days')::date
                        ELSE (t.reg_date + ((t.withdrawal_until_milk - t.reg_date) * 2) * INTERVAL '1 day')::date
                    END
                ELSE (CURRENT_DATE + INTERVAL '2 days')::date
            END
        ELSE t.withdrawal_until_milk
    END AS withdrawal_until_milk,
    -- Eco-farm adjusted withdrawal days (calculated from adjusted dates)
    CASE 
        WHEN f.is_eco_farm AND t.withdrawal_until_meat IS NOT NULL THEN
            CASE 
                WHEN t.withdrawal_until_meat >= CURRENT_DATE THEN
                    CASE 
                        WHEN (t.withdrawal_until_meat - CURRENT_DATE) = 0 THEN 2
                        ELSE (t.withdrawal_until_meat - CURRENT_DATE) * 2
                    END
                ELSE 2
            END
        ELSE
            CASE 
                WHEN t.withdrawal_until_meat IS NOT NULL AND t.withdrawal_until_meat >= CURRENT_DATE 
                THEN (t.withdrawal_until_meat - CURRENT_DATE)
                ELSE 0
            END
    END AS withdrawal_days_meat,
    CASE 
        WHEN f.is_eco_farm AND t.withdrawal_until_milk IS NOT NULL THEN
            CASE 
                WHEN t.withdrawal_until_milk >= CURRENT_DATE THEN
                    CASE 
                        WHEN (t.withdrawal_until_milk - CURRENT_DATE) = 0 THEN 2
                        ELSE (t.withdrawal_until_milk - CURRENT_DATE) * 2
                    END
                ELSE 2
            END
        ELSE
            CASE 
                WHEN t.withdrawal_until_milk IS NOT NULL AND t.withdrawal_until_milk >= CURRENT_DATE 
                THEN (t.withdrawal_until_milk - CURRENT_DATE)
                ELSE 0
            END
    END AS withdrawal_days_milk,
    CASE
        WHEN (f.is_eco_farm AND t.withdrawal_until_meat IS NOT NULL) OR 
             (NOT f.is_eco_farm AND t.withdrawal_until_meat >= CURRENT_DATE) THEN
            CASE
                WHEN (f.is_eco_farm AND t.withdrawal_until_milk IS NOT NULL) OR 
                     (NOT f.is_eco_farm AND t.withdrawal_until_milk >= CURRENT_DATE) THEN 'Mėsa ir pienas'
                ELSE 'Mėsa'
            END
        WHEN (f.is_eco_farm AND t.withdrawal_until_milk IS NOT NULL) OR 
             (NOT f.is_eco_farm AND t.withdrawal_until_milk >= CURRENT_DATE) THEN 'Pienas'
        ELSE 'Nėra'
    END AS withdrawal_type,
    COALESCE(d.name, t.clinical_diagnosis, 'Nenurodyta') AS disease_name,
    t.vet_name AS veterinarian,
    t.notes,
    (
        SELECT json_agg(
            json_build_object(
                'name', p.name,
                'quantity', ui.qty,
                'unit', ui.unit::text,
                'batch_lot', b.lot
            )
        )
        FROM public.usage_items ui
        JOIN public.products p ON ui.product_id = p.id
        LEFT JOIN public.batches b ON ui.batch_id = b.id
        WHERE ui.treatment_id = t.id
    ) AS medicines_detail,
    (
        SELECT string_agg(DISTINCT p.name, ', ')
        FROM public.usage_items ui
        JOIN public.products p ON ui.product_id = p.id
        WHERE ui.treatment_id = t.id
    ) AS medicines_used,
    t.created_at,
    t.updated_at
FROM public.treatments t
JOIN public.farms f ON t.farm_id = f.id
LEFT JOIN public.animals a ON t.animal_id = a.id
LEFT JOIN public.diseases d ON t.disease_id = d.id
WHERE 
    -- Show ALL treatments with withdrawal periods (including expired ones for eco-farms)
    t.withdrawal_until_meat IS NOT NULL OR t.withdrawal_until_milk IS NOT NULL
ORDER BY 
    f.name ASC,
    GREATEST(
        COALESCE(t.withdrawal_until_meat, '1900-01-01'::date),
        COALESCE(t.withdrawal_until_milk, '1900-01-01'::date)
    ) DESC;

COMMENT ON VIEW public.vw_withdrawal_journal_all_farms IS 'Farm-wide withdrawal journal (karencijos žurnalas) showing all animals with withdrawal periods across all farms. Includes eco-farm logic: 0 days becomes 2, others are multiplied by 2. Withdrawal dates are adjusted accordingly.';

-- Update vw_withdrawal_status to include eco-farm adjusted dates
DROP VIEW IF EXISTS public.vw_withdrawal_status CASCADE;

CREATE OR REPLACE VIEW public.vw_withdrawal_status AS
SELECT 
    t.farm_id,
    t.animal_id,
    a.tag_no,
    f.is_eco_farm,
    -- Original dates
    MAX(t.withdrawal_until_milk) AS milk_until_original,
    MAX(t.withdrawal_until_meat) AS meat_until_original,
    -- Eco-farm adjusted dates
    CASE 
        WHEN f.is_eco_farm THEN
            CASE 
                WHEN MAX(t.withdrawal_until_milk) IS NOT NULL AND MAX(t.withdrawal_until_milk) >= CURRENT_DATE THEN
                    CASE 
                        WHEN (MAX(t.withdrawal_until_milk) - CURRENT_DATE) = 0 
                        THEN (CURRENT_DATE + INTERVAL '2 days')::date
                        ELSE (MAX(t.reg_date) + ((MAX(t.withdrawal_until_milk) - MAX(t.reg_date)) * 2) * INTERVAL '1 day')::date
                    END
                WHEN MAX(t.withdrawal_until_milk) IS NOT NULL THEN (CURRENT_DATE + INTERVAL '2 days')::date
                ELSE NULL
            END
        ELSE MAX(t.withdrawal_until_milk)
    END AS milk_until,
    CASE 
        WHEN f.is_eco_farm THEN
            CASE 
                WHEN MAX(t.withdrawal_until_meat) IS NOT NULL AND MAX(t.withdrawal_until_meat) >= CURRENT_DATE THEN
                    CASE 
                        WHEN (MAX(t.withdrawal_until_meat) - CURRENT_DATE) = 0 
                        THEN (CURRENT_DATE + INTERVAL '2 days')::date
                        ELSE (MAX(t.reg_date) + ((MAX(t.withdrawal_until_meat) - MAX(t.reg_date)) * 2) * INTERVAL '1 day')::date
                    END
                WHEN MAX(t.withdrawal_until_meat) IS NOT NULL THEN (CURRENT_DATE + INTERVAL '2 days')::date
                ELSE NULL
            END
        ELSE MAX(t.withdrawal_until_meat)
    END AS meat_until,
    -- Active flags (based on adjusted dates for eco-farms)
    CASE
        WHEN f.is_eco_farm AND MAX(t.withdrawal_until_milk) IS NOT NULL THEN true
        WHEN NOT f.is_eco_farm AND MAX(t.withdrawal_until_milk) >= CURRENT_DATE THEN true
        ELSE false
    END AS milk_active,
    CASE
        WHEN f.is_eco_farm AND MAX(t.withdrawal_until_meat) IS NOT NULL THEN true
        WHEN NOT f.is_eco_farm AND MAX(t.withdrawal_until_meat) >= CURRENT_DATE THEN true
        ELSE false
    END AS meat_active
FROM public.treatments t
LEFT JOIN public.animals a ON a.id = t.animal_id
JOIN public.farms f ON t.farm_id = f.id
WHERE t.animal_id IS NOT NULL
GROUP BY t.farm_id, t.animal_id, a.tag_no, f.is_eco_farm;

COMMENT ON VIEW public.vw_withdrawal_status IS 'Current withdrawal status for all animals with eco-farm adjusted dates';
