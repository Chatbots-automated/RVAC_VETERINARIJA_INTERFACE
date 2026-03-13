-- =====================================================================
-- FINAL FIX: Remove Double Stock Deduction
-- =====================================================================
-- The database already has a trigger (trigger_update_batch_qty_left) 
-- that automatically deducts stock when usage_items are inserted.
-- Our function was ALSO deducting, causing double deduction!
-- =====================================================================

CREATE OR REPLACE FUNCTION public.process_visit_medications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_medication jsonb;
  v_treatment_id uuid;
  v_product record;
  v_unit_value text;
  v_requested_qty decimal;
  v_remaining_qty decimal;
  v_batch record;
  v_batch_qty decimal;
  v_total_available decimal;
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
        farm_id,
        animal_id,
        visit_id,
        reg_date,
        vet_name,
        created_by_user_id,
        notes
      ) VALUES (
        NEW.farm_id,
        NEW.animal_id,
        NEW.id,
        DATE(NEW.visit_datetime),
        NEW.vet_name,
        NEW.created_by_user_id,
        'Auto-created from course visit completion'
      )
      RETURNING id INTO v_treatment_id;

      RAISE NOTICE 'Created treatment record %', v_treatment_id;
    END IF;

    -- Process each planned medication
    FOR v_medication IN SELECT * FROM jsonb_array_elements(NEW.planned_medications)
    LOOP
      v_unit_value := v_medication->>'unit';
      v_requested_qty := (v_medication->>'qty')::decimal;

      -- Skip if no quantity specified
      IF v_requested_qty IS NULL OR v_requested_qty <= 0 THEN
        RAISE NOTICE 'Skipping medication with no quantity: %', v_medication->>'product_id';
        CONTINUE;
      END IF;

      -- Get product info
      SELECT * INTO v_product
      FROM products
      WHERE id = (v_medication->>'product_id')::uuid;

      IF NOT FOUND THEN
        RAISE NOTICE 'Product not found: %', v_medication->>'product_id';
        CONTINUE;
      END IF;

      -- Check if batch_id is provided
      IF v_medication->>'batch_id' IS NOT NULL AND v_medication->>'batch_id' != '' THEN
        -- Use the specified batch
        -- NOTE: Stock deduction happens automatically via trigger_update_batch_qty_left trigger
        INSERT INTO usage_items (
          farm_id,
          treatment_id,
          product_id,
          batch_id,
          qty,
          unit,
          purpose
        ) VALUES (
          NEW.farm_id,
          v_treatment_id,
          (v_medication->>'product_id')::uuid,
          (v_medication->>'batch_id')::uuid,
          v_requested_qty,
          v_unit_value::unit,
          COALESCE(v_medication->>'purpose', 'treatment')
        );

        RAISE NOTICE 'Created usage_item for % % of product % (stock deducted by trigger)', v_requested_qty, v_unit_value, v_product.name;
      ELSE
        RAISE NOTICE 'No batch specified for product %, skipping', v_product.name;
      END IF;
    END LOOP;

    -- Mark medications as processed
    NEW.medications_processed := true;
    RAISE NOTICE 'Medications processed for visit %', NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

-- =====================================================================
-- DONE! Now stock will deduct correctly (only once)
-- =====================================================================
