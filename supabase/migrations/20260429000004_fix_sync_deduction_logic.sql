-- Fix synchronization step medication deduction to allow multiple uses per day
-- The previous logic prevented creating usage_items for the same batch/product/day
-- Now we check for duplicates based on the specific synchronization step completion time

-- Drop existing trigger
DROP TRIGGER IF EXISTS trg_sync_step_stock_deduction ON public.synchronization_steps;

-- Recreate the function with fixed logic
CREATE OR REPLACE FUNCTION public.deduct_sync_step_medication()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Only proceed if step is being marked as completed
    IF NEW.completed = true AND OLD.completed = false THEN
        IF NEW.medication_product_id IS NOT NULL AND NEW.batch_id IS NOT NULL AND NEW.dosage IS NOT NULL THEN
            -- Check if a usage_item already exists for THIS specific step
            -- We check for a usage_item created within 5 seconds of this step's completion
            -- This prevents duplicates for the same step while allowing multiple steps per day
            IF NOT EXISTS (
                SELECT 1 
                FROM public.usage_items
                WHERE batch_id = NEW.batch_id
                  AND product_id = NEW.medication_product_id
                  AND purpose = 'synchronization'
                  AND treatment_id IS NULL
                  AND vaccination_id IS NULL
                  AND biocide_usage_id IS NULL
                  AND qty = NEW.dosage
                  AND unit = NEW.dosage_unit::public.unit
                  AND ABS(EXTRACT(EPOCH FROM (created_at - NEW.completed_at))) < 5
            ) THEN
                -- Create the usage_item
                INSERT INTO public.usage_items (
                    farm_id,
                    product_id,
                    batch_id,
                    qty,
                    unit,
                    purpose
                )
                VALUES (
                    NEW.farm_id,
                    NEW.medication_product_id,
                    NEW.batch_id,
                    NEW.dosage,
                    NEW.dosage_unit::public.unit,
                    'synchronization'
                );
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.deduct_sync_step_medication() IS 'Automatically deducts medication from inventory when synchronization step is completed - allows multiple uses per day for different animals';

-- Recreate the trigger
CREATE TRIGGER trg_sync_step_stock_deduction
    AFTER UPDATE OF completed ON public.synchronization_steps
    FOR EACH ROW
    EXECUTE FUNCTION public.deduct_sync_step_medication();

COMMENT ON TRIGGER trg_sync_step_stock_deduction ON public.synchronization_steps IS 'Deducts medication stock when a synchronization step is marked as completed';
