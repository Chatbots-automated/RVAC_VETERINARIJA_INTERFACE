/*
  # Fix process_visit_medications to copy disease information
  
  ## Problem
  When future visits from treatment courses are completed, the trigger creates
  treatment records but doesn't copy disease_id and clinical_diagnosis from the
  original treatment. This causes "Nespecifikuota liga" to appear in reports.
  
  ## Solution
  Update the trigger to:
  1. Check if visit has related_treatment_id
  2. Copy disease_id and clinical_diagnosis from the related treatment
  3. Fall back to current behavior if no related treatment exists
  
  ## Safety
  - Only modifies the trigger function, no table changes
  - Backward compatible - doesn't break existing functionality
  - Can be reverted by restoring previous function version
*/

CREATE OR REPLACE FUNCTION process_visit_medications()
RETURNS TRIGGER AS $$
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
  v_related_treatment record;
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
      -- Try to get disease info from related treatment (for course visits)
      IF NEW.related_treatment_id IS NOT NULL THEN
        SELECT 
          disease_id,
          clinical_diagnosis,
          animal_condition,
          tests,
          services
        INTO v_related_treatment
        FROM treatments
        WHERE id = NEW.related_treatment_id;
      END IF;

      -- Create treatment with disease info from related treatment if available
      INSERT INTO treatments (
        animal_id,
        visit_id,
        reg_date,
        disease_id,
        clinical_diagnosis,
        animal_condition,
        tests,
        services,
        vet_name,
        notes
      ) VALUES (
        NEW.animal_id,
        NEW.id,
        DATE(NEW.visit_datetime),
        v_related_treatment.disease_id,
        v_related_treatment.clinical_diagnosis,
        v_related_treatment.animal_condition,
        v_related_treatment.tests,
        v_related_treatment.services,
        NEW.vet_name,
        CASE 
          WHEN v_related_treatment.disease_id IS NOT NULL OR v_related_treatment.clinical_diagnosis IS NOT NULL 
          THEN 'Auto-created from course visit completion'
          ELSE 'Auto-created from course visit completion (no disease info from original treatment)'
        END
      )
      RETURNING id INTO v_treatment_id;

      RAISE NOTICE 'Created treatment record % with disease_id: %, clinical_diagnosis: %', 
        v_treatment_id, v_related_treatment.disease_id, v_related_treatment.clinical_diagnosis;
    END IF;

    -- Process each planned medication
    FOR v_medication IN SELECT * FROM jsonb_array_elements(NEW.planned_medications)
    LOOP
      RAISE NOTICE 'Processing medication: %', v_medication;

      -- Get product details for unit conversion if needed
      SELECT * INTO v_product
      FROM products
      WHERE id = (v_medication->>'product_id')::uuid;

      -- Extract unit value with proper default
      v_unit_value := COALESCE(v_medication->>'unit', 'ml');

      -- Validate unit value is not empty
      IF v_unit_value IS NULL OR v_unit_value = '' THEN
        v_unit_value := 'ml';
      END IF;

      -- Get requested quantity
      v_requested_qty := (v_medication->>'qty')::decimal;
      v_remaining_qty := v_requested_qty;

      IF v_treatment_id IS NOT NULL AND v_requested_qty > 0 THEN
        -- Check total available stock
        SELECT COALESCE(SUM(qty_left), 0) INTO v_total_available
        FROM batches
        WHERE product_id = (v_medication->>'product_id')::uuid
          AND qty_left > 0;

        IF v_total_available < v_requested_qty THEN
          RAISE EXCEPTION 'Insufficient stock for product %. Requested: %, Available: %',
            v_product.name, v_requested_qty, v_total_available;
        END IF;

        -- Loop through batches (FIFO - oldest expiry first) and deduct quantities
        FOR v_batch IN
          SELECT id, qty_left
          FROM batches
          WHERE product_id = (v_medication->>'product_id')::uuid
            AND qty_left > 0
          ORDER BY expiry_date ASC, created_at ASC
        LOOP
          -- Calculate how much to take from this batch
          v_batch_qty := LEAST(v_batch.qty_left, v_remaining_qty);

          BEGIN
            -- Create usage_item for this batch portion
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
              v_batch.id,
              v_batch_qty,
              v_unit_value::unit,
              COALESCE(v_medication->>'purpose', 'Gydymas'),
              v_medication->>'teat'
            );

            RAISE NOTICE 'Created usage_item: product=%, batch=%, qty=% %',
              v_medication->>'product_id', v_batch.id, v_batch_qty, v_unit_value;

            -- Reduce remaining quantity needed
            v_remaining_qty := v_remaining_qty - v_batch_qty;

            -- Exit loop if we've fulfilled the request
            IF v_remaining_qty <= 0 THEN
              EXIT;
            END IF;

          EXCEPTION
            WHEN OTHERS THEN
              RAISE NOTICE 'Error creating usage_item: %', SQLERRM;
              RAISE;
          END;
        END LOOP;

        -- If we still have remaining quantity, something went wrong
        IF v_remaining_qty > 0 THEN
          RAISE EXCEPTION 'Could not fulfill complete quantity for product %. Missing: %',
            v_product.name, v_remaining_qty;
        END IF;
      END IF;
    END LOOP;

    -- Mark medications as processed
    NEW.medications_processed := true;

    RAISE NOTICE 'Completed processing medications for visit %', NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION process_visit_medications IS 'Automatically creates usage_items and treatment records when visit status changes to Baigtas. Copies disease info from related_treatment_id for course visits.';
