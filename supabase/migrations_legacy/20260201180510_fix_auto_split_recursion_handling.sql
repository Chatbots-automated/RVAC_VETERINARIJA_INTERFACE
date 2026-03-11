/*
  # Fix Auto-Split Recursion Handling

  1. Changes
    - Adds session variable to track when we're in a split operation
    - Prevents infinite recursion when split items are inserted
    - Improves error handling and logging

  2. Logic
    - Set flag before splitting to prevent recursive splits
    - Clear flag after splitting completes
    - Allow split items to pass through normally
*/

CREATE OR REPLACE FUNCTION public.auto_split_usage_items()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_batch_qty_left numeric;
  v_remaining_qty numeric;
  v_batch record;
  v_allocated_qty numeric;
  v_product_id uuid;
  v_total_available numeric;
  v_is_splitting boolean;
BEGIN
  -- Check if we're already in a split operation (prevents infinite recursion)
  BEGIN
    v_is_splitting := current_setting('app.is_splitting_usage_items')::boolean;
  EXCEPTION
    WHEN OTHERS THEN
      v_is_splitting := false;
  END;

  -- If we're already splitting, just pass through
  IF v_is_splitting THEN
    RETURN NEW;
  END IF;

  -- Get the batch's current qty_left and product_id
  SELECT b.qty_left, b.product_id INTO v_batch_qty_left, v_product_id
  FROM batches b
  WHERE b.id = NEW.batch_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Batch not found: %', NEW.batch_id;
  END IF;

  -- If batch has enough stock, proceed normally
  IF v_batch_qty_left >= NEW.qty THEN
    RETURN NEW;
  END IF;

  RAISE NOTICE 'Batch % only has %, need %. Starting auto-split...', 
    NEW.batch_id, v_batch_qty_left, NEW.qty;

  -- Check total available stock
  SELECT COALESCE(SUM(qty_left), 0) INTO v_total_available
  FROM batches
  WHERE product_id = v_product_id
    AND qty_left > 0;

  IF v_total_available < NEW.qty THEN
    RAISE EXCEPTION 'Nepakanka atsargų! Turima iš viso: %, Reikia: %', v_total_available, NEW.qty;
  END IF;

  -- Set flag to indicate we're splitting (prevents recursion)
  PERFORM set_config('app.is_splitting_usage_items', 'true', true);

  BEGIN
    v_remaining_qty := NEW.qty;

    -- Loop through available batches in FIFO order
    FOR v_batch IN
      SELECT id, qty_left
      FROM batches
      WHERE product_id = v_product_id
        AND qty_left > 0
      ORDER BY expiry_date ASC, created_at ASC
    LOOP
      -- Calculate how much to allocate from this batch
      v_allocated_qty := LEAST(v_batch.qty_left, v_remaining_qty);

      -- Insert a new usage_item for this batch portion
      INSERT INTO usage_items (
        treatment_id,
        vaccination_id,
        biocide_usage_id,
        product_id,
        batch_id,
        qty,
        unit,
        purpose,
        teat
      ) VALUES (
        NEW.treatment_id,
        NEW.vaccination_id,
        NEW.biocide_usage_id,
        NEW.product_id,
        v_batch.id,
        v_allocated_qty,
        NEW.unit,
        NEW.purpose,
        NEW.teat
      );

      RAISE NOTICE 'Sukurtas padalintas įrašas: serija %, kiekis %', v_batch.id, v_allocated_qty;

      v_remaining_qty := v_remaining_qty - v_allocated_qty;

      -- Exit if we've allocated everything
      IF v_remaining_qty <= 0.001 THEN
        EXIT;
      END IF;
    END LOOP;

    -- Clear the splitting flag
    PERFORM set_config('app.is_splitting_usage_items', 'false', true);

    IF v_remaining_qty > 0.001 THEN
      RAISE EXCEPTION 'Nepavyko pilnai paskirstyti. Liko: %', v_remaining_qty;
    END IF;

  EXCEPTION
    WHEN OTHERS THEN
      -- Clear flag on error
      PERFORM set_config('app.is_splitting_usage_items', 'false', true);
      RAISE;
  END;

  -- Prevent the original INSERT since we've created split records
  RETURN NULL;
END;
$function$;
