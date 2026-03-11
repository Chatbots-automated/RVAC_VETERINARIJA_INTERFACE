/*
  # Fix Batch Stock Check for Auto-Split

  1. Changes
    - Updates `check_batch_stock` function to validate against total available stock for the product
    - Allows usage_items to be created even if single batch doesn't have enough
    - The auto-split logic will handle distributing across multiple batches

  2. Logic
    - If requested qty > single batch qty: check if total product stock is sufficient
    - Allows the insert to proceed if total stock is adequate
    - Actual batch splitting happens in `process_visit_medications` or via manual splits
*/

CREATE OR REPLACE FUNCTION public.check_batch_stock()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_qty_left numeric;
  v_batch_number text;
  v_product_name text;
  v_product_id uuid;
  v_total_available numeric;
BEGIN
  IF NEW.batch_id IS NOT NULL THEN
    SELECT b.qty_left, b.batch_number, p.name, p.id
    INTO v_qty_left, v_batch_number, v_product_name, v_product_id
    FROM batches b
    JOIN products p ON b.product_id = p.id
    WHERE b.id = NEW.batch_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Batch % not found', NEW.batch_id;
    END IF;

    IF v_qty_left IS NULL THEN
      RAISE EXCEPTION 'Batch % (%) has NULL qty_left', v_batch_number, v_product_name;
    END IF;

    -- If single batch doesn't have enough, check total available across all batches
    IF v_qty_left < NEW.qty THEN
      SELECT COALESCE(SUM(qty_left), 0) INTO v_total_available
      FROM batches
      WHERE product_id = v_product_id
        AND qty_left > 0;

      IF v_total_available < NEW.qty THEN
        RAISE EXCEPTION 'Not enough stock for "%" across all batches. Available: %, Tried: %',
          v_product_name, v_total_available, NEW.qty;
      END IF;
      
      -- If we have enough total stock, allow the insert
      -- The quantity will be auto-split across batches
      RAISE NOTICE 'Single batch insufficient (%). Will auto-split across % batches. Total available: %',
        v_qty_left, (SELECT COUNT(*) FROM batches WHERE product_id = v_product_id AND qty_left > 0), v_total_available;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
