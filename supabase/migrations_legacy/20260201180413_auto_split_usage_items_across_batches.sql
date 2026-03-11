/*
  # Auto-Split Usage Items Across Batches

  1. Changes
    - Creates trigger function to automatically split usage_items when single batch is insufficient
    - Uses FIFO approach (oldest expiry date first)
    - Replaces single usage_item with multiple items across different batches
    - Prevents the original INSERT and creates multiple split INSERTs

  2. Logic
    - Trigger runs BEFORE INSERT on usage_items
    - If requested qty > batch qty_left, automatically split:
      - Cancel the original INSERT (RETURN NULL)
      - Create multiple usage_items for each batch portion
    - Each split usage_item has the correct batch_id and qty

  3. Security
    - SECURITY DEFINER to allow automatic splitting
    - Maintains all RLS policies on usage_items
*/

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS auto_split_usage_items_trigger ON usage_items;

-- Create the auto-split function
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
BEGIN
  -- Get the batch's current qty_left and product_id
  SELECT b.qty_left, b.product_id INTO v_batch_qty_left, v_product_id
  FROM batches b
  WHERE b.id = NEW.batch_id;

  -- If batch has enough stock, proceed normally
  IF v_batch_qty_left >= NEW.qty THEN
    RETURN NEW;
  END IF;

  -- Check total available stock
  SELECT COALESCE(SUM(qty_left), 0) INTO v_total_available
  FROM batches
  WHERE product_id = v_product_id
    AND qty_left > 0;

  IF v_total_available < NEW.qty THEN
    RAISE EXCEPTION 'Insufficient total stock. Available: %, Required: %', v_total_available, NEW.qty;
  END IF;

  -- Auto-split across multiple batches
  RAISE NOTICE 'Auto-splitting % into multiple batches', NEW.qty;
  
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
    -- We need to temporarily disable the trigger to avoid infinite recursion
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

    RAISE NOTICE 'Created split usage_item: batch %, qty %', v_batch.id, v_allocated_qty;

    v_remaining_qty := v_remaining_qty - v_allocated_qty;

    -- Exit if we've allocated everything
    IF v_remaining_qty <= 0.001 THEN
      EXIT;
    END IF;
  END LOOP;

  -- Prevent the original INSERT since we've created split records
  RETURN NULL;
END;
$function$;

-- Create trigger that runs BEFORE the stock check trigger
-- Trigger order matters: this should run before check_batch_stock
DROP TRIGGER IF EXISTS trigger_auto_split_usage_items ON usage_items;
CREATE TRIGGER trigger_auto_split_usage_items
  BEFORE INSERT ON usage_items
  FOR EACH ROW
  EXECUTE FUNCTION auto_split_usage_items();
