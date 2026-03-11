-- Fix equipment batches that don't have purchase_price set
-- Get the price from the equipment_invoice_items

UPDATE public.equipment_batches eb
SET purchase_price = eii.unit_price
FROM public.equipment_invoice_items eii
WHERE eb.invoice_id = eii.invoice_id
  AND eb.product_id = eii.product_id
  AND (eb.purchase_price IS NULL OR eb.purchase_price = 0)
  AND eii.unit_price > 0;

-- Now fix work_order_parts prices based on the corrected batch prices
UPDATE public.work_order_parts wop
SET 
  unit_price = COALESCE(eb.purchase_price, 0),
  total_price = wop.quantity * COALESCE(eb.purchase_price, 0)
FROM public.equipment_batches eb
WHERE wop.batch_id = eb.id
  AND (wop.unit_price = 0 OR wop.unit_price IS NULL);

-- Show results
DO $$
DECLARE
  batch_count INTEGER;
  part_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO batch_count 
  FROM public.equipment_batches 
  WHERE purchase_price IS NOT NULL AND purchase_price > 0;
  
  SELECT COUNT(*) INTO part_count 
  FROM public.work_order_parts wop
  JOIN public.equipment_batches eb ON wop.batch_id = eb.id
  WHERE wop.unit_price > 0;
  
  RAISE NOTICE 'Batches with prices: %', batch_count;
  RAISE NOTICE 'Work order parts with prices: %', part_count;
END $$;
