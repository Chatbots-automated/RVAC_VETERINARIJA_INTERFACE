-- Fix existing work_order_parts that have unit_price = 0
-- Update them with the correct purchase_price from their batches

UPDATE public.work_order_parts wop
SET 
  unit_price = COALESCE(eb.purchase_price, 0),
  total_price = wop.quantity * COALESCE(eb.purchase_price, 0)
FROM public.equipment_batches eb
WHERE wop.batch_id = eb.id
  AND wop.unit_price = 0;

-- Show how many rows were updated
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Updated % work order parts with correct prices', updated_count;
END $$;
