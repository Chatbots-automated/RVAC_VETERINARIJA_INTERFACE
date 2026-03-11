/*
  # Course Medication Deduction System

  ## Overview
  This migration implements a system where medications for multi-day treatment courses
  are only deducted from inventory when each individual visit is marked as "Baigtas" (completed).

  ## Problem Being Solved
  Previously, when creating a 3-day treatment course with 60ml total (20ml/day):
  - ALL 60ml was deducted immediately from inventory
  - If animal died on day 1, only 20ml was actually used but 60ml was recorded as used
  - This creates inventory discrepancies and compliance issues

  ## Solution
  1. Store planned medications per visit in JSONB format
  2. Only deduct medications from inventory when visit status changes to "Baigtas"
  3. Create proper treatment records with registration numbers when each visit completes
  4. Track which visits have had their medications processed

  ## Changes

  1. **Add planned_medications column to animal_visits**
     - Stores medications that should be administered during this visit
     - JSONB array containing: product_id, batch_id, qty, unit, purpose, teat
     - NULL for visits without planned medications

  2. **Add medications_processed flag to animal_visits**
     - Tracks whether medications have been deducted from inventory
     - Prevents double-deduction if status changes multiple times

  3. **Create function to process visit medications**
     - Called when visit status changes to "Baigtas"
     - Creates usage_items records
     - Deducts from inventory
     - Updates medications_processed flag

  4. **Create trigger on animal_visits status change**
     - Automatically processes medications when status becomes "Baigtas"
     - Ensures medications are only processed once

  ## Security
  - Uses existing RLS policies on animal_visits table
  - Function runs with SECURITY DEFINER to ensure proper permissions
*/

-- Add planned_medications column to store medications for each visit
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'animal_visits' AND column_name = 'planned_medications'
  ) THEN
    ALTER TABLE public.animal_visits
    ADD COLUMN planned_medications jsonb NULL;
  END IF;
END $$;

-- Add flag to track if medications have been processed
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'animal_visits' AND column_name = 'medications_processed'
  ) THEN
    ALTER TABLE public.animal_visits
    ADD COLUMN medications_processed boolean DEFAULT false;
  END IF;
END $$;

-- Add related_visit_id to link course visits together
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'animal_visits' AND column_name = 'related_visit_id'
  ) THEN
    ALTER TABLE public.animal_visits
    ADD COLUMN related_visit_id uuid REFERENCES public.animal_visits(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Function to process visit medications when status becomes "Baigtas"
-- Fixed to only create usage_items (inventory is calculated via views)
CREATE OR REPLACE FUNCTION process_visit_medications()
RETURNS TRIGGER AS $$
DECLARE
  v_medication jsonb;
  v_treatment_id uuid;
  v_product record;
BEGIN
  -- Only process if status is changing TO "Baigtas" and medications haven't been processed yet
  IF NEW.status = 'Baigtas'
     AND (OLD.status IS NULL OR OLD.status != 'Baigtas')
     AND NEW.planned_medications IS NOT NULL
     AND NOT COALESCE(NEW.medications_processed, false) THEN

    RAISE NOTICE 'Processing medications for visit %', NEW.id;

    -- Get the treatment_id for this visit (if exists)
    SELECT id INTO v_treatment_id
    FROM treatments
    WHERE visit_id = NEW.id
    LIMIT 1;

    -- If no treatment exists yet and this visit requires treatment, create one
    IF v_treatment_id IS NULL AND NEW.treatment_required THEN
      INSERT INTO treatments (
        animal_id,
        visit_id,
        reg_date,
        vet_name,
        notes
      ) VALUES (
        NEW.animal_id,
        NEW.id,
        DATE(NEW.visit_datetime),
        NEW.vet_name,
        'Auto-created from course visit completion'
      )
      RETURNING id INTO v_treatment_id;

      RAISE NOTICE 'Created treatment record %', v_treatment_id;
    END IF;

    -- Process each planned medication
    FOR v_medication IN SELECT * FROM jsonb_array_elements(NEW.planned_medications)
    LOOP
      RAISE NOTICE 'Processing medication: %', v_medication;

      -- Get product details for unit conversion if needed
      SELECT * INTO v_product
      FROM products
      WHERE id = (v_medication->>'product_id')::uuid;

      -- Create usage_item record if we have a treatment
      -- The stock_by_batch view will automatically calculate remaining stock
      IF v_treatment_id IS NOT NULL THEN
        INSERT INTO usage_items (
          treatment_id,
          product_id,
          batch_id,
          qty,
          unit,
          purpose,
          teat
        ) VALUES (
          v_treatment_id,
          (v_medication->>'product_id')::uuid,
          (v_medication->>'batch_id')::uuid,
          (v_medication->>'qty')::decimal,
          COALESCE(v_medication->>'unit', 'ml')::unit,
          COALESCE(v_medication->>'purpose', 'Gydymas'),
          v_medication->>'teat'
        );

        RAISE NOTICE 'Created usage_item for treatment %. Product: %, Batch: %, Qty: % %',
          v_treatment_id,
          v_medication->>'product_id',
          v_medication->>'batch_id',
          v_medication->>'qty',
          COALESCE(v_medication->>'unit', 'ml');
      END IF;
    END LOOP;

    -- Mark medications as processed
    NEW.medications_processed := true;

    RAISE NOTICE 'Completed processing medications for visit %', NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically process medications when visit is completed
DROP TRIGGER IF EXISTS trigger_process_visit_medications ON public.animal_visits;
CREATE TRIGGER trigger_process_visit_medications
  BEFORE UPDATE ON public.animal_visits
  FOR EACH ROW
  EXECUTE FUNCTION process_visit_medications();

-- Add helpful comment
COMMENT ON COLUMN animal_visits.planned_medications IS 'JSONB array of medications planned for this visit. Each entry: {product_id, batch_id, qty, unit, purpose, teat}';
COMMENT ON COLUMN animal_visits.medications_processed IS 'Whether planned medications have been deducted from inventory';
COMMENT ON COLUMN animal_visits.related_visit_id IS 'Links to the original visit for course treatments';
COMMENT ON FUNCTION process_visit_medications IS 'Automatically creates usage_items when visit status changes to Baigtas. Inventory is calculated automatically via stock_by_batch view.';
