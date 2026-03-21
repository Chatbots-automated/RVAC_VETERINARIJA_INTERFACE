-- =====================================================================
-- Add Withdrawal Period (Karencija) Reports
-- =====================================================================
-- Migration: 20260321000006
-- Created: 2026-03-21
--
-- OVERVIEW:
-- Creates views for tracking animals with active withdrawal periods
-- 1. Per-farm withdrawal report (Išlaukų ataskaita)
-- 2. Farm-wide withdrawal journal (Karencijos žurnalas)
-- =====================================================================

-- =====================================================================
-- 1. PER-FARM WITHDRAWAL REPORT VIEW
-- =====================================================================
-- Shows animals with active withdrawal periods for a specific farm

CREATE OR REPLACE VIEW public.vw_withdrawal_report AS
SELECT 
    t.farm_id,
    f.name AS farm_name,
    f.code AS farm_code,
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

COMMENT ON VIEW public.vw_withdrawal_report IS 'Animals with active withdrawal periods (karencija) - per farm';

-- =====================================================================
-- 2. FARM-WIDE WITHDRAWAL JOURNAL VIEW
-- =====================================================================
-- Shows all animals with withdrawal periods across ALL farms

CREATE OR REPLACE VIEW public.vw_withdrawal_journal_all_farms AS
SELECT 
    t.farm_id,
    f.name AS farm_name,
    f.code AS farm_code,
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
    CASE
        WHEN t.withdrawal_until_meat >= CURRENT_DATE AND t.withdrawal_until_milk >= CURRENT_DATE THEN 'Mėsa ir pienas'
        WHEN t.withdrawal_until_meat >= CURRENT_DATE THEN 'Mėsa'
        WHEN t.withdrawal_until_milk >= CURRENT_DATE THEN 'Pienas'
        ELSE 'Nėra'
    END AS withdrawal_type,
    COALESCE(d.name, t.clinical_diagnosis, 'Nenurodyta') AS disease_name,
    t.vet_name AS veterinarian,
    t.notes,
    -- Get medicines used in this treatment with details
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
    (t.withdrawal_until_meat IS NOT NULL AND t.withdrawal_until_meat >= CURRENT_DATE)
    OR (t.withdrawal_until_milk IS NOT NULL AND t.withdrawal_until_milk >= CURRENT_DATE)
ORDER BY 
    f.name ASC,
    GREATEST(
        COALESCE(t.withdrawal_until_meat, '1900-01-01'::date),
        COALESCE(t.withdrawal_until_milk, '1900-01-01'::date)
    ) ASC;

COMMENT ON VIEW public.vw_withdrawal_journal_all_farms IS 'Farm-wide withdrawal journal (karencijos žurnalas) showing all animals with active withdrawal periods across all farms for Vetpraktika UAB reporting';
