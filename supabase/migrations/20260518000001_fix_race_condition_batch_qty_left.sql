-- =====================================================================
-- Fix Race Condition in Batch Stock Deduction
-- =====================================================================
-- Issue: When multiple usage_items are inserted rapidly (within milliseconds),
-- the trigger update_batch_qty_left() causes a race condition where multiple
-- concurrent updates to batches.qty_left overwrite each other, resulting in
-- lost deductions.
--
-- Example: 5 items of 0.025 kg inserted in 400ms resulted in only 4 deductions
-- being applied (stock showed 4.9 kg instead of 4.875 kg).
--
-- Root Cause: The UPDATE statement in the trigger does not use row-level
-- locking (FOR UPDATE), allowing concurrent transactions to read the same
-- qty_left value before any of them write back.
--
-- Solution: Add row-level locking with SELECT ... FOR UPDATE to ensure
-- sequential processing of concurrent deductions.
-- =====================================================================

-- Drop and recreate the trigger function with proper locking
CREATE OR REPLACE FUNCTION public.update_batch_qty_left()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_batch_record RECORD;
BEGIN
    -- Lock the batch row to prevent race conditions
    -- This ensures concurrent updates are processed sequentially
    SELECT id, qty_left, status
    INTO v_batch_record
    FROM batches
    WHERE id = NEW.batch_id
    FOR UPDATE;

    -- Check if batch exists
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Batch % not found', NEW.batch_id;
    END IF;

    -- Now update with the locked values
    UPDATE batches
    SET
        qty_left = qty_left - NEW.qty,
        status = CASE
            WHEN (qty_left - NEW.qty) <= 0 THEN 'depleted'
            ELSE status
        END,
        updated_at = NOW()
    WHERE id = NEW.batch_id;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.update_batch_qty_left() IS 
'Automatically updates qty_left when usage_items are inserted. 
Uses row-level locking (FOR UPDATE) to prevent race conditions 
when multiple usage_items are inserted concurrently.';
