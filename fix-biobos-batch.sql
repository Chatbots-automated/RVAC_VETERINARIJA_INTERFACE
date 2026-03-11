-- Fix BioBos Respi 4 batch LOT 705232BLV data entry error
-- The batch was entered with 1.99 packages instead of 22 packages
-- This caused received_qty to be 19.9 ml instead of 220 ml
-- But 220 ml was actually used (105 vaccinations × 2ml each)

-- Correct the batch data
UPDATE batches
SET 
  package_count = 22,
  received_qty = 220,
  qty_left = 0,
  status = 'depleted',
  updated_at = NOW()
WHERE lot = '705232BLV' 
  AND package_count = 1.99
  AND received_qty = 19.9;

-- Verify the fix
SELECT 
  lot,
  package_size,
  package_count,
  received_qty,
  qty_left,
  status,
  created_at
FROM batches
WHERE lot = '705232BLV';
