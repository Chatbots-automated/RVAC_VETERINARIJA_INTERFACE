/*
  # Skip Stock Check During Split Operation

  1. Changes
    - Updates stock check to skip validation when auto-split is active
    - Allows split items to bypass single-batch validation
    - Maintains validation for normal (non-split) operations
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
  v_is_splitting boolean;
BEGIN
  -- Check if we're in a split operation
  BEGIN
    v_is_splitting := current_setting('app.is_splitting_usage_items')::boolean;
  EXCEPTION
    WHEN OTHERS THEN
      v_is_splitting := false;
  END;

  -- If we're splitting, the auto-split function has already validated total stock
  IF v_is_splitting THEN
    RETURN NEW;
  END IF;

  IF NEW.batch_id IS NOT NULL THEN
    SELECT b.qty_left, b.batch_number, p.name, p.id
    INTO v_qty_left, v_batch_number, v_product_name, v_product_id
    FROM batches b
    JOIN products p ON b.product_id = p.id
    WHERE b.id = NEW.batch_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Serija nerasta: %', NEW.batch_id;
    END IF;

    IF v_qty_left IS NULL THEN
      RAISE EXCEPTION 'Serijos % (%) qty_left yra NULL', v_batch_number, v_product_name;
    END IF;

    -- If single batch doesn't have enough, check total available across all batches
    IF v_qty_left < NEW.qty THEN
      SELECT COALESCE(SUM(qty_left), 0) INTO v_total_available
      FROM batches
      WHERE product_id = v_product_id
        AND qty_left > 0;

      IF v_total_available < NEW.qty THEN
        RAISE EXCEPTION 'Nepakanka atsargų produktui "%". Turima iš viso: %, Reikia: %',
          v_product_name, v_total_available, NEW.qty;
      END IF;
      
      -- If we have enough total stock, this will be auto-split
      -- The auto-split trigger will handle creating multiple records
      RAISE NOTICE 'Vienos serijos nepakanka (%). Bus automatiškai padalinta tarp % serijų. Turima iš viso: %',
        v_qty_left, 
        (SELECT COUNT(*) FROM batches WHERE product_id = v_product_id AND qty_left > 0), 
        v_total_available;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
