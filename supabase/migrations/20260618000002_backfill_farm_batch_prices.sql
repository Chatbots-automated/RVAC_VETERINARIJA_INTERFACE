-- =====================================================================
-- Fix: Backfill missing purchase_price in farm batches from warehouse
-- =====================================================================
-- Created: 2026-06-18
-- Description:
--   Some farm batches may have null purchase_price because they were
--   allocated before the view was fixed. This migration backfills those
--   prices from the original warehouse batches.
-- =====================================================================

-- Update farm batches that have an allocation_id and missing purchase_price
UPDATE public.batches b
SET 
    purchase_price = wb.purchase_price,
    currency = COALESCE(b.currency, wb.currency, 'EUR')
FROM public.farm_stock_allocations fsa
JOIN public.warehouse_batches wb ON fsa.warehouse_batch_id = wb.id
WHERE b.allocation_id = fsa.id
  AND b.purchase_price IS NULL
  AND wb.purchase_price IS NOT NULL;

-- Log the fix
DO $$
DECLARE
    updated_count integer;
BEGIN
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RAISE NOTICE 'Updated % farm batches with missing purchase prices', updated_count;
END $$;
