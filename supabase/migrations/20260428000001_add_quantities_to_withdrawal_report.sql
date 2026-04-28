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
    t.withdrawal_until_meat,
    t.withdrawal_until_milk,
    CASE
        WHEN t.withdrawal_until_meat IS NOT NULL AND t.withdrawal_until_meat >= CURRENT_DATE
        THEN (t.withdrawal_until_meat - CURRENT_DATE)
        ELSE 0
    END AS withdrawal_days_meat,
    CASE 
        WHEN t.withdrawal_until_milk IS NOT NULL AND t.withdrawal_until_milk >= CURRENT_DATE 
        THEN (t.withdrawal_until_milk - CURRENT_DATE)
        ELSE 0
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
    -- Get quantities used with units
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
WHERE 
    (t.withdrawal_until_meat IS NOT NULL AND t.withdrawal_until_meat >= CURRENT_DATE)
    OR (t.withdrawal_until_milk IS NOT NULL AND t.withdrawal_until_milk >= CURRENT_DATE)
ORDER BY 
    GREATEST(
        COALESCE(t.withdrawal_until_meat, '1900-01-01'::date),
        COALESCE(t.withdrawal_until_milk, '1900-01-01'::date)
    ) ASC;

COMMENT ON VIEW public.vw_withdrawal_report IS 'Animals with active withdrawal periods (karencija) with quantities used - per farm';

-- Update vw_withdrawal_journal_all_farms to include quantities
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
    t.withdrawal_until_meat,
    t.withdrawal_until_milk,
    CASE
        WHEN t.withdrawal_until_meat IS NOT NULL AND t.withdrawal_until_meat >= CURRENT_DATE
        THEN (t.withdrawal_until_meat - CURRENT_DATE)
        ELSE 0
    END AS withdrawal_days_meat,
    CASE 
        WHEN t.withdrawal_until_milk IS NOT NULL AND t.withdrawal_until_milk >= CURRENT_DATE 
        THEN (t.withdrawal_until_milk - CURRENT_DATE)
        ELSE 0
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
    -- Get quantities used with units
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
WHERE 
    (t.withdrawal_until_meat IS NOT NULL AND t.withdrawal_until_meat >= CURRENT_DATE)
    OR (t.withdrawal_until_milk IS NOT NULL AND t.withdrawal_until_milk >= CURRENT_DATE)
ORDER BY 
    GREATEST(
        COALESCE(t.withdrawal_until_meat, '1900-01-01'::date),
        COALESCE(t.withdrawal_until_milk, '1900-01-01'::date)
    ) ASC;

COMMENT ON VIEW public.vw_withdrawal_journal_all_farms IS 'Farm-wide withdrawal journal with quantities used across all farms';

-- Grant permissions
GRANT SELECT ON public.vw_withdrawal_report TO authenticated;
GRANT SELECT ON public.vw_withdrawal_journal_all_farms TO authenticated;
