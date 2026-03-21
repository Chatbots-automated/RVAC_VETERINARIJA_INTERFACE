-- =====================================================================
-- Add Farm-Wide Report Views
-- =====================================================================
-- Migration: 20260321000002
-- Created: 2026-03-21
--
-- OVERVIEW:
-- Creates aggregated views for farm-wide reporting across all farms
-- for regulatory compliance (Vetpraktika UAB level reporting)
--
-- VIEWS:
-- 1. vw_vet_drug_journal_all_farms - Drug journal across all farms
-- 2. vw_treated_animals_all_farms - Treated animals across all farms
-- =====================================================================

-- =====================================================================
-- 1. FARM-WIDE VETERINARY DRUG JOURNAL
-- =====================================================================
-- Aggregates drug RECEIPTS across ALL farms for Vetpraktika UAB reporting
-- Shows when medicine was received (not usage)

-- Drop the view first to avoid column order issues
DO $$ 
BEGIN
    DROP VIEW IF EXISTS public.vw_vet_drug_journal_all_farms CASCADE;
EXCEPTION 
    WHEN OTHERS THEN NULL;
END $$;

CREATE VIEW public.vw_vet_drug_journal_all_farms AS
-- Farm-level batches
SELECT 
    b.created_at::date AS receipt_date,
    f.name AS farm_name,
    f.code AS farm_code,
    p.name AS product_name,
    p.id AS product_id,
    p.registration_code,
    p.active_substance,
    p.primary_pack_unit AS unit,
    b.lot AS batch_number,
    b.lot,
    b.expiry_date,
    b.received_qty AS quantity_received,
    (b.received_qty - b.qty_left) AS quantity_used,
    b.qty_left AS quantity_remaining,
    s.name AS supplier_name,
    b.doc_title,
    b.doc_number AS invoice_number,
    b.doc_date AS invoice_date,
    b.farm_id,
    b.id AS batch_id,
    'farm_batch' AS source
FROM public.batches b
JOIN public.farms f ON b.farm_id = f.id
JOIN public.products p ON b.product_id = p.id
LEFT JOIN public.suppliers s ON b.supplier_id = s.id
WHERE p.category IN ('medicines', 'prevention')

UNION ALL

-- Warehouse-level batches (allocated to farms)
SELECT 
    wb.created_at::date AS receipt_date,
    'Vetpraktika UAB Sandėlis' AS farm_name,
    'WAREHOUSE' AS farm_code,
    p.name AS product_name,
    p.id AS product_id,
    p.registration_code,
    p.active_substance,
    p.primary_pack_unit AS unit,
    wb.lot AS batch_number,
    wb.lot,
    wb.expiry_date,
    wb.received_qty AS quantity_received,
    wb.qty_allocated AS quantity_used,
    wb.qty_left AS quantity_remaining,
    s.name AS supplier_name,
    wb.doc_title,
    wb.doc_number AS invoice_number,
    wb.doc_date AS invoice_date,
    NULL::uuid AS farm_id,
    wb.id AS batch_id,
    'warehouse_batch' AS source
FROM public.warehouse_batches wb
JOIN public.products p ON wb.product_id = p.id
LEFT JOIN public.suppliers s ON wb.supplier_id = s.id
WHERE p.category IN ('medicines', 'prevention')

ORDER BY receipt_date DESC;

COMMENT ON VIEW public.vw_vet_drug_journal_all_farms IS 'Farm-wide veterinary drug journal showing medicine receipts (not usage) across all farms and warehouse for Vetpraktika UAB reporting';

-- =====================================================================
-- 2. FARM-WIDE TREATED ANIMALS REGISTER (DETAILED)
-- =====================================================================
-- Aggregates treated animals across ALL farms for Vetpraktika UAB reporting
-- Matches the structure of vw_treated_animals_detailed but includes all farms

DROP VIEW IF EXISTS public.vw_treated_animals_all_farms CASCADE;

CREATE VIEW public.vw_treated_animals_all_farms AS
-- Medications from usage_items (one-time usage)
SELECT 
    t.farm_id,
    f.name AS farm_name,
    f.code AS farm_code,
    t.id AS treatment_id,
    t.animal_id,
    t.disease_id,
    t.reg_date AS registration_date,
    t.created_at,
    a.tag_no AS animal_tag,
    a.species,
    a.sex,
    a.birth_date,
    EXTRACT(YEAR FROM AGE(COALESCE(t.reg_date::date, CURRENT_DATE), a.birth_date::date)) * 12 + 
    EXTRACT(MONTH FROM AGE(COALESCE(t.reg_date::date, CURRENT_DATE), a.birth_date::date)) AS age_months,
    a.holder_name AS owner_name,
    a.holder_address AS owner_address,
    COALESCE(d.name, NULLIF(TRIM(t.clinical_diagnosis), ''), NULLIF(TRIM(t.animal_condition), ''), 'Nespecifikuota liga') AS disease_name,
    d.code AS disease_code,
    t.clinical_diagnosis,
    COALESCE(t.animal_condition, 'Patenkinama') AS animal_condition,
    COALESCE(t.first_symptoms_date, t.reg_date) AS first_symptoms_date,
    COALESCE(
        t.tests,
        CASE 
            WHEN av.temperature IS NOT NULL 
            THEN 'Temperatūra: ' || av.temperature::text || '°C'
            ELSE NULL
        END
    ) AS tests,
    t.services,
    p.name AS medicine_name,
    p.id AS medicine_id,
    ui.qty AS medicine_dose,
    ui.unit::text AS medicine_unit,
    COALESCE((
        SELECT MAX(tc.days)
        FROM public.treatment_courses tc
        WHERE tc.treatment_id = t.id
    ), 1) AS medicine_days,
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
    t.outcome AS treatment_outcome,
    COALESCE(t.vet_name, 'Nenurodyta') AS veterinarian,
    t.notes,
    'usage_item' AS medication_source
FROM public.treatments t
JOIN public.farms f ON t.farm_id = f.id
LEFT JOIN public.animals a ON t.animal_id = a.id
LEFT JOIN public.diseases d ON t.disease_id = d.id
LEFT JOIN public.usage_items ui ON t.id = ui.treatment_id
LEFT JOIN public.products p ON ui.product_id = p.id
LEFT JOIN public.animal_visits av ON t.visit_id = av.id

UNION ALL

-- Medications from treatment_courses (multi-day courses)
SELECT 
    t.farm_id,
    f.name AS farm_name,
    f.code AS farm_code,
    t.id AS treatment_id,
    t.animal_id,
    t.disease_id,
    t.reg_date AS registration_date,
    t.created_at,
    a.tag_no AS animal_tag,
    a.species,
    a.sex,
    a.birth_date,
    EXTRACT(YEAR FROM AGE(COALESCE(t.reg_date::date, CURRENT_DATE), a.birth_date::date)) * 12 + 
    EXTRACT(MONTH FROM AGE(COALESCE(t.reg_date::date, CURRENT_DATE), a.birth_date::date)) AS age_months,
    a.holder_name AS owner_name,
    a.holder_address AS owner_address,
    COALESCE(d.name, NULLIF(TRIM(t.clinical_diagnosis), ''), NULLIF(TRIM(t.animal_condition), ''), 'Nespecifikuota liga') AS disease_name,
    d.code AS disease_code,
    t.clinical_diagnosis,
    COALESCE(t.animal_condition, 'Patenkinama') AS animal_condition,
    COALESCE(t.first_symptoms_date, t.reg_date) AS first_symptoms_date,
    COALESCE(
        t.tests,
        CASE 
            WHEN av.temperature IS NOT NULL 
            THEN 'Temperatūra: ' || av.temperature::text || '°C'
            ELSE NULL
        END
    ) AS tests,
    t.services,
    p.name AS medicine_name,
    p.id AS medicine_id,
    tc.daily_dose AS medicine_dose,
    tc.unit::text AS medicine_unit,
    tc.days AS medicine_days,
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
    t.outcome AS treatment_outcome,
    COALESCE(t.vet_name, 'Nenurodyta') AS veterinarian,
    t.notes,
    'treatment_course' AS medication_source
FROM public.treatments t
JOIN public.farms f ON t.farm_id = f.id
LEFT JOIN public.animals a ON t.animal_id = a.id
LEFT JOIN public.diseases d ON t.disease_id = d.id
LEFT JOIN public.treatment_courses tc ON t.id = tc.treatment_id
LEFT JOIN public.products p ON tc.product_id = p.id
LEFT JOIN public.animal_visits av ON t.visit_id = av.id

UNION ALL

-- Medications from planned_medications (from visits - JSONB array)
SELECT 
    t.farm_id,
    f.name AS farm_name,
    f.code AS farm_code,
    t.id AS treatment_id,
    t.animal_id,
    t.disease_id,
    t.reg_date AS registration_date,
    t.created_at,
    a.tag_no AS animal_tag,
    a.species,
    a.sex,
    a.birth_date,
    EXTRACT(YEAR FROM AGE(COALESCE(t.reg_date::date, CURRENT_DATE), a.birth_date::date)) * 12 + 
    EXTRACT(MONTH FROM AGE(COALESCE(t.reg_date::date, CURRENT_DATE), a.birth_date::date)) AS age_months,
    a.holder_name AS owner_name,
    a.holder_address AS owner_address,
    COALESCE(d.name, NULLIF(TRIM(t.clinical_diagnosis), ''), NULLIF(TRIM(t.animal_condition), ''), 'Nespecifikuota liga') AS disease_name,
    d.code AS disease_code,
    t.clinical_diagnosis,
    COALESCE(t.animal_condition, 'Patenkinama') AS animal_condition,
    COALESCE(t.first_symptoms_date, t.reg_date) AS first_symptoms_date,
    COALESCE(
        t.tests,
        CASE 
            WHEN av.temperature IS NOT NULL 
            THEN 'Temperatūra: ' || av.temperature::text || '°C'
            ELSE NULL
        END
    ) AS tests,
    t.services,
    p.name AS medicine_name,
    p.id AS medicine_id,
    (med.value->>'dose')::numeric AS medicine_dose,
    (med.value->>'unit')::text AS medicine_unit,
    COALESCE((med.value->>'days')::integer, 1) AS medicine_days,
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
    t.outcome AS treatment_outcome,
    COALESCE(t.vet_name, 'Nenurodyta') AS veterinarian,
    t.notes,
    'planned_medication' AS medication_source
FROM public.treatments t
JOIN public.farms f ON t.farm_id = f.id
LEFT JOIN public.animals a ON t.animal_id = a.id
LEFT JOIN public.diseases d ON t.disease_id = d.id
JOIN public.animal_visits av ON av.id = t.visit_id
CROSS JOIN LATERAL jsonb_array_elements(av.planned_medications) AS med(value)
JOIN public.products p ON p.id = (med.value->>'product_id')::uuid
WHERE av.planned_medications IS NOT NULL 
  AND jsonb_array_length(av.planned_medications) > 0

ORDER BY registration_date DESC, created_at DESC;

COMMENT ON VIEW public.vw_treated_animals_all_farms IS 'Farm-wide treated animals register aggregating treatments across all farms for Vetpraktika UAB reporting (detailed with all medication sources)';

-- =====================================================================
-- 3. FARM-WIDE DRUG JOURNAL WITH BATCH TRACKING (Enhanced)
-- =====================================================================
-- Similar to existing per-farm view but includes all farms

CREATE OR REPLACE VIEW public.vw_drug_journal_batches_all_farms AS
SELECT 
    b.id AS batch_id,
    b.farm_id,
    f.name AS farm_name,
    f.code AS farm_code,
    b.product_id,
    b.created_at AS receipt_date,
    p.name AS product_name,
    p.registration_code,
    p.active_substance,
    s.name AS supplier_name,
    b.lot AS batch_number,
    b.mfg_date AS manufacture_date,
    b.expiry_date,
    b.received_qty AS quantity_received,
    p.primary_pack_unit AS unit,
    (b.received_qty - b.qty_left) AS quantity_used,
    b.qty_left AS quantity_remaining,
    b.doc_number AS invoice_number,
    b.doc_date AS invoice_date,
    COALESCE(b.doc_title, 'Invoice') AS doc_title,
    b.allocation_id
FROM public.batches b
JOIN public.farms f ON b.farm_id = f.id
JOIN public.products p ON b.product_id = p.id
LEFT JOIN public.suppliers s ON b.supplier_id = s.id
WHERE p.category IN ('medicines', 'prevention')
ORDER BY b.created_at DESC;

COMMENT ON VIEW public.vw_drug_journal_batches_all_farms IS 'Farm-wide drug journal showing batch-level inventory across all farms';

-- =====================================================================
-- 4. WAREHOUSE STOCK AVAILABILITY VIEW
-- =====================================================================
-- Shows available warehouse stock that can be allocated

CREATE OR REPLACE VIEW public.vw_warehouse_stock_available AS
SELECT 
    wb.id AS warehouse_batch_id,
    wb.product_id,
    p.name AS product_name,
    p.category,
    p.primary_pack_unit AS unit,
    wb.lot,
    wb.expiry_date,
    wb.received_qty,
    wb.qty_left AS available_qty,
    wb.qty_allocated,
    wb.status,
    s.name AS supplier_name,
    wb.doc_number,
    wb.doc_date,
    wb.created_at
FROM public.warehouse_batches wb
JOIN public.products p ON wb.product_id = p.id
LEFT JOIN public.suppliers s ON wb.supplier_id = s.id
WHERE wb.qty_left > 0 
  AND wb.status = 'active'
  AND (wb.expiry_date IS NULL OR wb.expiry_date >= CURRENT_DATE)
ORDER BY wb.expiry_date ASC NULLS LAST, wb.created_at ASC;

COMMENT ON VIEW public.vw_warehouse_stock_available IS 'Available warehouse stock ready for allocation (FIFO order)';

-- =====================================================================
-- 5. GRANT PERMISSIONS
-- =====================================================================

GRANT SELECT ON public.vw_vet_drug_journal_all_farms TO authenticated;
GRANT SELECT ON public.vw_treated_animals_all_farms TO authenticated;
GRANT SELECT ON public.vw_drug_journal_batches_all_farms TO authenticated;
GRANT SELECT ON public.vw_warehouse_stock_available TO authenticated;
