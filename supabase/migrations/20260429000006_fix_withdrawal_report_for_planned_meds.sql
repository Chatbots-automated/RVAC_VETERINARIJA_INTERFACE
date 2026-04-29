-- Fix Withdrawal Report to include planned_medications from animal_visits
-- This handles multi-day treatment courses that store each day as a separate visit

DROP VIEW IF EXISTS public.vw_withdrawal_report CASCADE;
DROP VIEW IF EXISTS public.vw_withdrawal_journal_all_farms CASCADE;

CREATE OR REPLACE VIEW public.vw_withdrawal_report AS

-- Branch 1: Treatments with medicines from usage_items
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
    t.withdrawal_until_meat AS withdrawal_until_meat_original,
    t.withdrawal_until_milk AS withdrawal_until_milk_original,
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
    (
        SELECT string_agg(
            CASE 
                WHEN ui.qty IS NOT NULL AND ui.qty > 0 
                THEN ui.qty::text || ' ' || COALESCE(ui.unit::text, 'vnt')
                ELSE NULL
            END, 
            ', '
        )
        FROM public.usage_items ui
        WHERE ui.treatment_id = t.id AND ui.qty IS NOT NULL AND ui.qty > 0
    ) AS quantities_used,
    'treatment' AS source_type,
    t.created_at,
    t.updated_at
FROM public.treatments t
JOIN public.farms f ON t.farm_id = f.id
LEFT JOIN public.animals a ON t.animal_id = a.id
LEFT JOIN public.diseases d ON t.disease_id = d.id

UNION ALL

-- Branch 2: Synchronization protocol medicines
SELECT 
    ui.farm_id,
    f.name AS farm_name,
    f.code AS farm_code,
    f.is_eco_farm,
    ui.id AS treatment_id,
    sync.animal_id,
    a.tag_no AS animal_tag,
    a.species,
    a.sex,
    ui.created_at::date AS treatment_date,
    NULL::date AS withdrawal_until_meat_original,
    NULL::date AS withdrawal_until_milk_original,
    CASE 
        WHEN p.withdrawal_days_meat > 0 
        THEN (ui.created_at::date + (p.withdrawal_days_meat * CASE WHEN f.is_eco_farm THEN 2 ELSE 1 END))
        ELSE NULL
    END AS withdrawal_until_meat,
    CASE 
        WHEN p.withdrawal_days_milk > 0 
        THEN (ui.created_at::date + (p.withdrawal_days_milk * CASE WHEN f.is_eco_farm THEN 2 ELSE 1 END))
        ELSE NULL
    END AS withdrawal_until_milk,
    CASE 
        WHEN p.withdrawal_days_meat IS NULL OR p.withdrawal_days_meat = 0 THEN 0
        WHEN (ui.created_at::date + (p.withdrawal_days_meat * CASE WHEN f.is_eco_farm THEN 2 ELSE 1 END)) >= CURRENT_DATE 
        THEN (ui.created_at::date + (p.withdrawal_days_meat * CASE WHEN f.is_eco_farm THEN 2 ELSE 1 END)) - CURRENT_DATE
        ELSE 0
    END AS withdrawal_days_meat,
    CASE 
        WHEN p.withdrawal_days_milk IS NULL OR p.withdrawal_days_milk = 0 THEN 0
        WHEN (ui.created_at::date + (p.withdrawal_days_milk * CASE WHEN f.is_eco_farm THEN 2 ELSE 1 END)) >= CURRENT_DATE 
        THEN (ui.created_at::date + (p.withdrawal_days_milk * CASE WHEN f.is_eco_farm THEN 2 ELSE 1 END)) - CURRENT_DATE
        ELSE 0
    END AS withdrawal_days_milk,
    'Sinchronizacijos protokolas' AS disease_name,
    'Nenurodyta' AS veterinarian,
    'Sinchronizacijos protokolas' AS notes,
    p.name AS medicines_used,
    CONCAT(ui.qty::text, ' ', ui.unit::text) AS quantities_used,
    'synchronization' AS source_type,
    ui.created_at,
    ui.created_at AS updated_at
FROM public.usage_items ui
LEFT JOIN public.products p ON ui.product_id = p.id
LEFT JOIN public.farms f ON ui.farm_id = f.id
LEFT JOIN public.synchronization_steps ss ON ss.batch_id = ui.batch_id 
    AND ss.medication_product_id = ui.product_id 
    AND ss.completed = true
    AND ABS(EXTRACT(EPOCH FROM (ss.completed_at - ui.created_at))) < 10
LEFT JOIN public.animal_synchronizations sync ON ss.synchronization_id = sync.id
LEFT JOIN public.animals a ON sync.animal_id = a.id
WHERE ui.purpose = 'synchronization'
  AND ui.treatment_id IS NULL
  AND ui.vaccination_id IS NULL
  AND ui.biocide_usage_id IS NULL

ORDER BY 
    farm_name ASC,
    treatment_date DESC;

COMMENT ON VIEW public.vw_withdrawal_report IS 'All treatments and synchronization medicines for withdrawal report with quantities used';

-- Create all_farms version
CREATE OR REPLACE VIEW public.vw_withdrawal_journal_all_farms AS
SELECT * FROM public.vw_withdrawal_report;

COMMENT ON VIEW public.vw_withdrawal_journal_all_farms IS 'Farm-wide withdrawal journal showing all treatments and synchronization medicines across all farms';

GRANT SELECT ON public.vw_withdrawal_report TO authenticated;
GRANT SELECT ON public.vw_withdrawal_journal_all_farms TO authenticated;
