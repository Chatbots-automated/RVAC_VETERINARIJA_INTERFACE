/*
  # Revert synchronization batch splitting
  
  This reverts the changes made in 20260213000004_fix_sync_batch_splitting.sql
  Restores the original function that only deducts from a single batch.
*/

CREATE OR REPLACE FUNCTION deduct_sync_step_medication()
RETURNS TRIGGER AS $$
DECLARE
  v_qty_left numeric;
  v_lot text;
  v_dosage_qty numeric;
BEGIN
  -- Only process when step is being marked as completed (false -> true transition)
  IF NEW.completed = TRUE AND COALESCE(OLD.completed, FALSE) = FALSE THEN

    -- Must have both batch_id and dosage
    IF NEW.batch_id IS NOT NULL AND NEW.dosage IS NOT NULL THEN

      v_dosage_qty := NEW.dosage::numeric;

      -- Lock the batch row to prevent race conditions / double deductions
      SELECT qty_left, lot
        INTO v_qty_left, v_lot
      FROM batches
      WHERE id = NEW.batch_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Batch % not found for sync step %', NEW.batch_id, NEW.id;
      END IF;

      -- Check if sufficient stock available
      IF v_qty_left < v_dosage_qty THEN
        RAISE EXCEPTION
          'Insufficient stock in batch % (%). Available: %, Required: %',
          v_lot, NEW.batch_id, v_qty_left, v_dosage_qty;
      END IF;

      -- Deduct stock from batch
      UPDATE batches
      SET qty_left = qty_left - v_dosage_qty,
          updated_at = NOW()
      WHERE id = NEW.batch_id;

      RAISE NOTICE 'Deducted % units from batch % (%) for sync step %',
        v_dosage_qty, v_lot, NEW.batch_id, NEW.id;

    END IF;
  END IF;

  RETURN NEW;
END;
$$
LANGUAGE plpgsql SECURITY DEFINER;
