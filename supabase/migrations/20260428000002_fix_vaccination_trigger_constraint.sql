-- =====================================================================
-- Fix Vaccination Trigger - Don't Set treatment_id
-- =====================================================================
-- Migration: 20260428000002
-- Created: 2026-04-28
--
-- ISSUE:
-- The vaccination trigger was trying to set BOTH treatment_id and 
-- vaccination_id, which violates the usage_items_source_check constraint.
-- The constraint requires EXACTLY ONE source ID to be set.
--
-- FIX:
-- For vaccinations, ONLY set vaccination_id, never treatment_id.
-- This keeps the constraint happy while still creating the usage_item.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.create_usage_item_from_vaccination()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_has_treatment boolean;
BEGIN
    IF NEW.batch_id IS NOT NULL AND NEW.dose_amount IS NOT NULL AND NEW.dose_amount > 0 THEN
        -- Check if there's a treatment for this animal on the same date
        -- If yes, the bulk treatment code creates usage_items manually, so skip
        SELECT EXISTS (
            SELECT 1 FROM public.treatments t
            WHERE t.animal_id = NEW.animal_id
              AND t.farm_id = NEW.farm_id
              AND t.reg_date = NEW.vaccination_date
              AND (t.clinical_diagnosis LIKE '%Masinis gydymas%' 
                   OR t.clinical_diagnosis LIKE '%Vakcin%')
        ) INTO v_has_treatment;

        -- Only create usage_item if there's NO associated treatment
        -- (standalone vaccinations only)
        IF NOT v_has_treatment THEN
            INSERT INTO usage_items (
                farm_id,
                treatment_id,
                product_id,
                batch_id,
                qty,
                unit,
                purpose,
                vaccination_id,
                created_at
            ) VALUES (
                NEW.farm_id,
                NULL,
                NEW.product_id,
                NEW.batch_id,
                NEW.dose_amount,
                NEW.unit::unit,
                'vaccination',
                NEW.id,
                NEW.created_at
            );

            RAISE NOTICE 'Created usage_item for standalone vaccination %. Product: %, Batch: %, Qty: % %',
                NEW.id, NEW.product_id, NEW.batch_id, NEW.dose_amount, NEW.unit;
        ELSE
            RAISE NOTICE 'Skipped usage_item for vaccination % - treatment exists, usage_item created by bulk treatment code',
                NEW.id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.create_usage_item_from_vaccination() IS 'Automatically creates usage_item for standalone vaccinations only. For mass treatments (vaccinations with associated treatment record), the bulk treatment code creates usage_items manually.';
