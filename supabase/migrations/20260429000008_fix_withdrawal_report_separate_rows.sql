-- =====================================================================
-- Fix Withdrawal Report: Separate Rows for Multi-Day Courses
-- =====================================================================
-- Created: 2026-04-29
-- Description:
--   Previously the withdrawal report aggregated all usage_items by treatment_id,
--   which caused multi-day courses to show as one row with concatenated quantities.
--   Now each day of a multi-day course gets its own row with its own administered_date.
-- =====================================================================

DROP VIEW IF EXISTS public.vw_withdrawal_report CASCADE;
DROP VIEW IF EXISTS public.vw_withdrawal_journal_all_farms CASCADE;

CREATE OR REPLACE VIEW public.vw_withdrawal_report AS

-- Branch 1: Medications from usage_items (includes multi-day courses)
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
    COALESCE(ui.administered_date, t.reg_date) AS treatment_date,
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
    p.name AS medicines_used,
    CASE 
        WHEN ui.qty IS NOT NULL AND ui.qty > 0 
        THEN ui.qty::text || ' ' || COALESCE(ui.unit::text, 'vnt')
        ELSE NULL
    END AS quantities_used,
    'treatment' AS source_type,
    t.created_at,
    t.updated_at
FROM public.treatments t
JOIN public.farms f ON t.farm_id = f.id
LEFT JOIN public.animals a ON t.animal_id = a.id
LEFT JOIN public.diseases d ON t.disease_id = d.id
LEFT JOIN public.usage_items ui ON ui.treatment_id = t.id
LEFT JOIN public.products p ON ui.product_id = p.id
WHERE ui.id IS NOT NULL

UNION ALL

-- Branch 2: Synchronization protocol medicines
SELECT 
    ui.farm_id,
    f.name AS farm_name,
    f.code AS farm_code,
    f.is_eco_farm,
    NULL::uuid AS treatment_id,
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
        WHEN p.withdrawal_days_meat > 0 
        THEN 
            CASE 
                WHEN (ui.created_at::date + (p.withdrawal_days_meat * CASE WHEN f.is_eco_farm THEN 2 ELSE 1 END)) >= CURRENT_DATE 
                THEN ((ui.created_at::date + (p.withdrawal_days_meat * CASE WHEN f.is_eco_farm THEN 2 ELSE 1 END)) - CURRENT_DATE)
                ELSE 0
            END
        ELSE 0
    END AS withdrawal_days_meat,
    CASE 
        WHEN p.withdrawal_days_milk > 0 
        THEN 
            CASE 
                WHEN (ui.created_at::date + (p.withdrawal_days_milk * CASE WHEN f.is_eco_farm THEN 2 ELSE 1 END)) >= CURRENT_DATE 
                THEN ((ui.created_at::date + (p.withdrawal_days_milk * CASE WHEN f.is_eco_farm THEN 2 ELSE 1 END)) - CURRENT_DATE)
                ELSE 0
            END
        ELSE 0
    END AS withdrawal_days_milk,
    'Sinchronizacija' AS disease_name,
    COALESCE(av.vet_name, 'Nenurodyta') AS veterinarian,
    'Sinchronizacijos protokolas' AS notes,
    p.name AS medicines_used,
    CASE 
        WHEN ui.qty IS NOT NULL AND ui.qty > 0 
        THEN ui.qty::text || ' ' || COALESCE(ui.unit::text, 'vnt')
        ELSE NULL
    END AS quantities_used,
    'synchronization' AS source_type,
    ui.created_at,
    ui.created_at AS updated_at
FROM public.usage_items ui
LEFT JOIN public.farms f ON ui.farm_id = f.id
LEFT JOIN public.products p ON ui.product_id = p.id
LEFT JOIN public.batches b ON ui.batch_id = b.id
LEFT JOIN public.synchronization_steps ss ON ss.batch_id = ui.batch_id 
    AND ss.medication_product_id = ui.product_id 
    AND ss.completed = true
    AND ABS(EXTRACT(EPOCH FROM (ss.completed_at - ui.created_at))) < 10
LEFT JOIN public.animal_synchronizations sync ON ss.synchronization_id = sync.id
LEFT JOIN public.animals a ON sync.animal_id = a.id
LEFT JOIN public.animal_visits av ON av.sync_step_id = ss.id
WHERE ui.purpose = 'synchronization'
  AND ui.treatment_id IS NULL
  AND ui.vaccination_id IS NULL
  AND ui.biocide_usage_id IS NULL;

-- Create all-farms view
CREATE OR REPLACE VIEW public.vw_withdrawal_journal_all_farms AS
SELECT * FROM public.vw_withdrawal_report
ORDER BY treatment_date DESC, created_at DESC;

-- Grant permissions
GRANT SELECT ON public.vw_withdrawal_report TO authenticated;
GRANT SELECT ON public.vw_withdrawal_report TO anon;
GRANT SELECT ON public.vw_withdrawal_journal_all_farms TO authenticated;
GRANT SELECT ON public.vw_withdrawal_journal_all_farms TO anon;
