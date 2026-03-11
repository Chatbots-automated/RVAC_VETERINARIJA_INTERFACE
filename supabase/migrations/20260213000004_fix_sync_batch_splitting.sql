/*
  # Fix synchronization batch splitting (FIFO across multiple batches)
  
  ## Problem
  The current deduct_sync_step_medication() function throws an error if a single
  batch doesn't have enough stock. For example, if they need 6ml but a batch only
  has 5ml left, it fails instead of taking 5ml from that batch and 1ml from the next.
  
  ## Solution
  Update the function to use FIFO (First In First Out) logic across multiple batches,
  just like the treatment system does. This will:
  1. Take from oldest batch first (by expiry_date)
  2. If not enough in that batch, take what's available
  3. Continue to next batch until full dosage is fulfilled
  4. Create usage_items for tracking (like treatments do)
  
  ## Safety
  - Only modifies the trigger function, no table changes
  - Backward compatible
  - Can be reverted
*/

CREATE OR REPLACE FUNCTION deduct_sync_step_medication()
RETURNS TRIGGER AS $$
DECLARE
  v_batch record;
  v_batch_qty numeric;
  v_remaining_qty numeric;
  v_product record;
  v_treatment_id uuid;
  v_total_available numeric;
BEGIN
  -- Only process when step is being marked as completed (false -> true transition)
  IF NEW.completed = TRUE AND COALESCE(OLD.completed, FALSE) = FALSE THEN

    -- Must have medication_product_id and dosage
    IF NEW.medication_product_id IS NOT NULL AND NEW.dosage IS NOT NULL THEN

      v_remaining_qty := NEW.dosage::numeric;

      -- Get product details
      SELECT * INTO v_product
      FROM products
      WHERE id = NEW.medication_product_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Product % not found for sync step %', NEW.medication_product_id, NEW.id;
      END IF;

      -- Check total available stock across all batches
      SELECT COALESCE(SUM(qty_left), 0) INTO v_total_available
      FROM batches
      WHERE product_id = NEW.medication_product_id
        AND qty_left > 0;

      IF v_total_available < v_remaining_qty THEN
        RAISE EXCEPTION 'Insufficient stock for product %. Requested: % %, Available: % %',
          v_product.name, v_remaining_qty, NEW.dosage_unit, v_total_available, NEW.dosage_unit;
      END IF;

      -- Get or create treatment record for this synchronization
      -- Check if there's a visit for this sync step
      SELECT t.id INTO v_treatment_id
      FROM treatments t
      JOIN animal_visits v ON v.id = t.visit_id
      WHERE v.sync_step_id = NEW.id
      LIMIT 1;

      -- If no treatment exists, we can't create usage_items due to constraint
      -- usage_items_source_check requires treatment_id, vaccination_id, or biocide_usage_id
      -- For now, just deduct from batches without creating usage_items
      -- This matches the old behavior

      -- Loop through batches (FIFO - oldest expiry first) and deduct quantities
      FOR v_batch IN
        SELECT id, qty_left, lot
        FROM batches
        WHERE product_id = NEW.medication_product_id
          AND qty_left > 0
        ORDER BY expiry_date ASC, created_at ASC
        FOR UPDATE
      LOOP
        -- Calculate how much to take from this batch
        v_batch_qty := LEAST(v_batch.qty_left, v_remaining_qty);

        RAISE NOTICE 'Taking % % from batch % (lot: %, had: % left)',
          v_batch_qty, NEW.dosage_unit, v_batch.id, v_batch.lot, v_batch.qty_left;

        -- Deduct from batch
        UPDATE batches
        SET qty_left = qty_left - v_batch_qty,
            updated_at = NOW()
        WHERE id = v_batch.id;

        -- Create usage_item for tracking ONLY if we have a treatment_id
        -- This is required by usage_items_source_check constraint
        IF v_treatment_id IS NOT NULL THEN
          INSERT INTO usage_items (
            treatment_id,
            product_id,
            batch_id,
            qty,
            unit,
            purpose
          ) VALUES (
            v_treatment_id,
            NEW.medication_product_id,
            v_batch.id,
            v_batch_qty,
            NEW.dosage_unit::unit,
            'Sinchronizacija'
          );
        END IF;

        -- Reduce remaining quantity needed
        v_remaining_qty := v_remaining_qty - v_batch_qty;

        -- Exit loop if we've fulfilled the request
        IF v_remaining_qty <= 0 THEN
          EXIT;
        END IF;
      END LOOP;

      -- If we still have remaining quantity, something went wrong
      IF v_remaining_qty > 0 THEN
        RAISE EXCEPTION 'Could not fulfill complete quantity for product %. Missing: % %',
          v_product.name, v_remaining_qty, NEW.dosage_unit;
      END IF;

      RAISE NOTICE 'Successfully deducted % % of % across multiple batches for sync step %',
        NEW.dosage, NEW.dosage_unit, v_product.name, NEW.id;

    END IF;
  END IF;

  RETURN NEW;
END;
$$
LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION deduct_sync_step_medication IS 'Deducts synchronization medication from stock using FIFO across multiple batches. Creates usage_items for tracking.';
