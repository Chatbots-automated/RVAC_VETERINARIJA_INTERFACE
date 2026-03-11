-- Fix negative qty_left values in batches table
-- This addresses the root cause of negative stock displays

-- Step 1: Find and fix batches with negative qty_left
-- Set them to 0 and mark as depleted
UPDATE batches
SET 
  qty_left = 0,
  status = 'depleted',
  updated_at = NOW()
WHERE qty_left < 0;

-- Step 2: Add CHECK constraint to prevent future negative qty_left
-- This matches the constraint on equipment_batches
ALTER TABLE batches 
DROP CONSTRAINT IF EXISTS batches_qty_left_check;

ALTER TABLE batches 
ADD CONSTRAINT batches_qty_left_check CHECK (qty_left >= 0);

-- Step 3: Update the stock check function to provide better error messages
CREATE OR REPLACE FUNCTION check_batch_stock()
RETURNS TRIGGER AS $$
DECLARE
  v_qty_left numeric;
  v_batch_number text;
  v_product_name text;
  v_lot text;
BEGIN
  -- Only check if we have a batch_id
  IF NEW.batch_id IS NOT NULL THEN
    -- Get current stock level and product info
    SELECT b.qty_left, b.batch_number, b.lot, p.name
    INTO v_qty_left, v_batch_number, v_lot, v_product_name
    FROM batches b
    JOIN products p ON b.product_id = p.id
    WHERE b.id = NEW.batch_id;

    -- Check if batch exists
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Batch % not found', NEW.batch_id;
    END IF;

    -- Check if we have enough stock
    IF v_qty_left IS NULL THEN
      RAISE EXCEPTION 'Batch % (LOT: %, Product: %) has NULL qty_left', 
        v_batch_number, v_lot, v_product_name;
    END IF;

    IF v_qty_left < NEW.qty THEN
      RAISE EXCEPTION 'Nepakanka atsargų produktui "%" (LOT: %). Likutis: % ml, Bandoma naudoti: % ml',
        v_product_name, v_lot, v_qty_left, NEW.qty;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_batch_stock() IS 'Prevents usage_items from being created when batch stock is insufficient. Updated to provide Lithuanian error messages.';
