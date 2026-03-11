/*
  # Fix Vaccination Stock Deduction

  ## Problem
  Vaccinations are not being deducted from stock in the Inventory (atsargos) tab because:
  - Inventory calculates stock as: received_qty - sum(usage_items.qty)
  - Treatments create usage_items records → Stock gets deducted ✅
  - Vaccinations do NOT create usage_items records → Stock does NOT get deducted ❌

  However, vaccinations ARE tracked correctly in the "vaistų panaudojimas" section
  because that component reads from both usage_items AND vaccinations tables.

  ## Solution
  Create a database trigger that automatically creates usage_items records
  whenever a vaccination is inserted. This ensures:
  1. Stock is properly deducted in the Inventory tab
  2. Consistent inventory tracking across all product usage types
  3. No double-counting in ProductUsageAnalysis

  ## Changes
  1. Make treatment_id nullable (to support vaccinations without treatments)
  2. Add vaccination_id column to usage_items to track the relationship
  3. Create function to generate usage_items from vaccinations
  4. Create trigger to call this function on vaccination INSERT
  5. Backfill existing vaccinations (with stock validation disabled for historical data)
*/

-- Step 1: Make treatment_id nullable in usage_items
-- This is CRITICAL - vaccinations don't have treatments!
DO $$
BEGIN
  -- Check if treatment_id is currently NOT NULL
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'usage_items'
      AND column_name = 'treatment_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.usage_items
    ALTER COLUMN treatment_id DROP NOT NULL;
    
    RAISE NOTICE 'Made treatment_id nullable in usage_items';
  END IF;
END $$;

-- Step 2: Add vaccination_id column to usage_items to track which vaccinations have been converted
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'usage_items' AND column_name = 'vaccination_id'
  ) THEN
    ALTER TABLE public.usage_items
    ADD COLUMN vaccination_id uuid REFERENCES public.vaccinations(id) ON DELETE CASCADE;
    
    CREATE INDEX IF NOT EXISTS idx_usage_items_vaccination_id ON public.usage_items(vaccination_id);
    
    RAISE NOTICE 'Added vaccination_id column to usage_items';
  END IF;
END $$;

-- Step 3: Add constraint to ensure either treatment_id OR vaccination_id is set (but not both)
DO $$
BEGIN
  -- Drop the constraint if it exists (for re-runs)
  ALTER TABLE public.usage_items
  DROP CONSTRAINT IF EXISTS usage_items_source_check;
  
  -- Add the constraint
  ALTER TABLE public.usage_items
  ADD CONSTRAINT usage_items_source_check CHECK (
    (treatment_id IS NOT NULL AND vaccination_id IS NULL) OR
    (treatment_id IS NULL AND vaccination_id IS NOT NULL)
  );
  
  RAISE NOTICE 'Added check constraint to ensure either treatment_id OR vaccination_id is set';
END $$;

-- Step 4: Function to create usage_item when vaccination is inserted
CREATE OR REPLACE FUNCTION create_usage_item_from_vaccination()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create usage_item if we have a batch_id and dose_amount
  IF NEW.batch_id IS NOT NULL AND NEW.dose_amount IS NOT NULL AND NEW.dose_amount > 0 THEN

    -- Insert into usage_items with vaccination-specific purpose
    INSERT INTO usage_items (
      treatment_id,
      product_id,
      batch_id,
      qty,
      unit,
      purpose,
      vaccination_id,
      created_at
    ) VALUES (
      NULL,  -- vaccinations don't have treatment_id
      NEW.product_id,
      NEW.batch_id,
      NEW.dose_amount,
      NEW.unit,
      'vaccination',  -- Mark as vaccination for tracking
      NEW.id,  -- Link back to vaccination
      NEW.created_at
    );

    RAISE NOTICE 'Created usage_item for vaccination %. Product: %, Batch: %, Qty: % %',
      NEW.id,
      NEW.product_id,
      NEW.batch_id,
      NEW.dose_amount,
      NEW.unit;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 5: Create trigger to automatically create usage_items when vaccination is inserted
DROP TRIGGER IF EXISTS trigger_create_usage_from_vaccination ON public.vaccinations;
CREATE TRIGGER trigger_create_usage_from_vaccination
  AFTER INSERT ON public.vaccinations
  FOR EACH ROW
  EXECUTE FUNCTION create_usage_item_from_vaccination();

-- Step 6: Temporarily disable stock validation trigger for backfill
-- We need to backfill historical vaccinations, but the stock check will fail
-- because those vaccinations already consumed the stock
DO $$
DECLARE
  v_trigger_exists boolean;
BEGIN
  -- Check if the stock validation trigger exists
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'usage_items_stock_check_trigger'
  ) INTO v_trigger_exists;
  
  IF v_trigger_exists THEN
    -- Temporarily disable the trigger
    ALTER TABLE usage_items DISABLE TRIGGER usage_items_stock_check_trigger;
    RAISE NOTICE 'Temporarily disabled stock validation trigger for backfill';
  END IF;
END $$;

-- Step 7: Backfill existing vaccinations to create usage_items
-- Only process vaccinations that don't already have a usage_item
DO $$
DECLARE
  v_inserted_count integer;
BEGIN
  INSERT INTO usage_items (
    treatment_id,
    product_id,
    batch_id,
    qty,
    unit,
    purpose,
    vaccination_id,
    created_at
  )
  SELECT
    NULL,  -- vaccinations don't have treatment_id
    v.product_id,
    v.batch_id,
    v.dose_amount,
    v.unit,
    'vaccination',
    v.id,
    v.created_at
  FROM vaccinations v
  WHERE v.batch_id IS NOT NULL
    AND v.dose_amount IS NOT NULL
    AND v.dose_amount > 0
    AND NOT EXISTS (
      SELECT 1 FROM usage_items ui
      WHERE ui.vaccination_id = v.id
    );
  
  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
  RAISE NOTICE 'Backfilled % vaccinations into usage_items', v_inserted_count;
END $$;

-- Step 8: Re-enable stock validation trigger
DO $$
DECLARE
  v_trigger_exists boolean;
BEGIN
  -- Check if the stock validation trigger exists
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'usage_items_stock_check_trigger'
  ) INTO v_trigger_exists;
  
  IF v_trigger_exists THEN
    -- Re-enable the trigger
    ALTER TABLE usage_items ENABLE TRIGGER usage_items_stock_check_trigger;
    RAISE NOTICE 'Re-enabled stock validation trigger';
  END IF;
END $$;

-- Step 9: Add helpful comments
COMMENT ON COLUMN usage_items.treatment_id IS 'Links to treatment record (NULL for vaccinations)';
COMMENT ON COLUMN usage_items.vaccination_id IS 'Links to vaccination record (NULL for treatments)';
COMMENT ON FUNCTION create_usage_item_from_vaccination IS 'Automatically creates usage_items record when vaccination is inserted to ensure stock is properly deducted';
COMMENT ON TRIGGER trigger_create_usage_from_vaccination ON public.vaccinations IS 'Ensures vaccinations are deducted from inventory by creating usage_items records';
COMMENT ON CONSTRAINT usage_items_source_check ON public.usage_items IS 'Ensures usage_items are linked to either a treatment OR a vaccination, but not both';
