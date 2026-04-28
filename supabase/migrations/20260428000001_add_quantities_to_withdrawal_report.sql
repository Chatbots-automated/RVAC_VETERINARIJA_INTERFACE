-- =====================================================================
-- Add Quantities Used to Withdrawal Reports
-- =====================================================================
-- Migration: 20260428000001
-- Created: 2026-04-28
--
-- OVERVIEW:
-- Adds "quantities_used" column to withdrawal reports showing
-- the amount of medicine used (e.g., "4ml", "10g", "2 svirkst")
-- =====================================================================

-- Drop existing views first
DROP VIEW IF EXISTS public.vw_withdrawal_report CASCADE;
DROP VIEW IF EXISTS public.vw_withdrawal_journal_all_farms CASCADE;

-- Update vw_withdrawal_report to include quantities
-- IMPORTANT: This preserves the 20260423 migration that shows ALL treatments
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
    -- Get medicines used in this treatment
    (
        SELECT string_agg(DISTINCT p.name, ', ')
        FROM public.usage_items ui
        JOIN public.products p ON ui.product_id = p.id
        WHERE ui.treatment_id = t.id
    ) AS medicines_used,
    -- NEW: Get quantities used with units
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
    t.created_at,
    t.updated_at
FROM public.treatments t
JOIN public.farms f ON t.farm_id = f.id
LEFT JOIN public.animals a ON t.animal_id = a.id
LEFT JOIN public.diseases d ON t.disease_id = d.id
-- REMOVED: WHERE clause that filtered only treatments with withdrawal
-- Now showing ALL treatments (matches GYDOMŲ GYVŪNŲ REGISTRACIJOS ŽURNALAS)
ORDER BY 
    f.name ASC,
    t.reg_date DESC;

COMMENT ON VIEW public.vw_withdrawal_report IS 'All treatments for withdrawal report with quantities used - includes treatments without withdrawal periods. Includes eco-farm logic: 0 days becomes 2, others are multiplied by 2';

-- Update vw_withdrawal_journal_all_farms to include quantities
-- IMPORTANT: This preserves the 20260423 migration that shows ALL treatments
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
    -- Get medicines used
    (
        SELECT string_agg(DISTINCT p.name, ', ')
        FROM public.usage_items ui
        JOIN public.products p ON ui.product_id = p.id
        WHERE ui.treatment_id = t.id
    ) AS medicines_used,
    -- NEW: Get quantities used with units
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
    t.created_at,
    t.updated_at
FROM public.treatments t
JOIN public.farms f ON t.farm_id = f.id
LEFT JOIN public.animals a ON t.animal_id = a.id
LEFT JOIN public.diseases d ON t.disease_id = d.id
-- REMOVED: WHERE clause that filtered only treatments with withdrawal
-- Now showing ALL treatments across all farms (matches GYDOMŲ GYVŪNŲ REGISTRACIJOS ŽURNALAS)
ORDER BY 
    f.name ASC,
    t.reg_date DESC;

COMMENT ON VIEW public.vw_withdrawal_journal_all_farms IS 'Farm-wide withdrawal journal with quantities used showing all treatments across all farms (even without withdrawal periods). Includes eco-farm logic: 0 days becomes 2, others are multiplied by 2';

-- Grant permissions
GRANT SELECT ON public.vw_withdrawal_report TO authenticated;
GRANT SELECT ON public.vw_withdrawal_journal_all_farms TO authenticated;
