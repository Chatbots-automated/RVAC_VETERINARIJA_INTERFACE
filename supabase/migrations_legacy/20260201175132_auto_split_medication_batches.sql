/*
  # Auto-Split Medication Batches

  1. Changes
    - Updates `process_visit_medications` trigger function to automatically split medication quantities across multiple batches
    - Uses FIFO approach (oldest expiry date first)
    - Creates multiple usage_items records when a single batch doesn't have enough stock
    - Automatically allocates from available batches until full quantity is satisfied

  2. Logic
    - When processing a medication with quantity > single batch available:
      - Fetch all available batches for the product (ordered by expiry date)
      - Deduct from each batch in sequence until requested quantity is met
      - Create one usage_item per batch used
    - If total available stock < requested quantity, raise an error

  3. Security
    - Maintains existing RLS policies
    - SECURITY DEFINER for automated processing
*/

-- Drop and recreate the function with batch splitting logic
CREATE OR REPLACE FUNCTION public.process_visit_medications()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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

            RAISE NOTICE 'Created usage_item: Batch %, Qty: % %',
              v_batch.id, v_batch_qty, v_unit_value;

            -- Reduce remaining quantity needed
            v_remaining_qty := v_remaining_qty - v_batch_qty;

            -- Exit loop if we've allocated all requested quantity
            IF v_remaining_qty <= 0 THEN
              EXIT;
            END IF;

          EXCEPTION
            WHEN OTHERS THEN
              RAISE WARNING 'Failed to create usage_item for batch %. Error: %', v_batch.id, SQLERRM;
              -- Continue with next batch
          END;
        END LOOP;

        -- Final check that we allocated everything
        IF v_remaining_qty > 0.001 THEN
          RAISE WARNING 'Could not fully allocate medication. Remaining: % %', v_remaining_qty, v_unit_value;
        END IF;
      END IF;
    END LOOP;

    -- Mark medications as processed
    NEW.medications_processed := true;

    RAISE NOTICE 'Completed processing medications for visit %', NEW.id;
  END IF;

  RETURN NEW;
END;
$function$;
