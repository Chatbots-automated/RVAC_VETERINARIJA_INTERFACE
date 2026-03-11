# How to Apply Stock Fixes

## Problem Summary

BioBos Respi 4 (and potentially other products) have **negative qty_left values in the database**. This is the root cause of the negative stock displays.

**Example:**
- Batch 705232BLV: Received 19.9 ml, but qty_left = -200.1 ml
- This means 220 ml was deducted, causing an overdraft of 200.1 ml

## Why This Happened

The `batches` table does NOT have a CHECK constraint to prevent negative `qty_left`. When stock was used, the trigger deducted it even when qty_left went below 0.

## The Fix (2 SQL Scripts to Run)

### Step 1: Fix the Drug Journal View

Run this in **Supabase SQL Editor**:

```sql
-- Fix vw_vet_drug_journal view to use qty_left instead of summing usage_items
DROP VIEW IF EXISTS vw_vet_drug_journal;

CREATE OR REPLACE VIEW vw_vet_drug_journal AS
SELECT 
  b.id AS batch_id,
  b.product_id,
  b.created_at AS receipt_date,
  p.name AS product_name,
  p.registration_code,
  p.active_substance,
  s.name AS supplier_name,
  b.lot,
  b.batch_number,
  b.mfg_date AS manufacture_date,
  b.expiry_date,
  b.received_qty AS quantity_received,
  p.primary_pack_unit AS unit,
  (b.received_qty - COALESCE(b.qty_left, 0)) AS quantity_used,
  COALESCE(b.qty_left, 0) AS quantity_remaining,
  b.doc_title,
  b.doc_number AS invoice_number,
  b.doc_date AS invoice_date
FROM batches b
JOIN products p ON b.product_id = p.id
LEFT JOIN suppliers s ON b.supplier_id = s.id
WHERE p.category IN ('medicines', 'prevention')
ORDER BY b.created_at DESC;
```

### Step 2: Fix Negative qty_left and Add Constraint

Run this in **Supabase SQL Editor**:

```sql
-- Fix negative qty_left values in batches table
UPDATE batches
SET 
  qty_left = 0,
  status = 'depleted',
  updated_at = NOW()
WHERE qty_left < 0;

-- Add CHECK constraint to prevent future negative qty_left
ALTER TABLE batches 
DROP CONSTRAINT IF EXISTS batches_qty_left_check;

ALTER TABLE batches 
ADD CONSTRAINT batches_qty_left_check CHECK (qty_left >= 0);

-- Update the stock check function with better error messages
CREATE OR REPLACE FUNCTION check_batch_stock()
RETURNS TRIGGER AS $$
DECLARE
  v_qty_left numeric;
  v_batch_number text;
  v_product_name text;
  v_lot text;
BEGIN
  IF NEW.batch_id IS NOT NULL THEN
    SELECT b.qty_left, b.batch_number, b.lot, p.name
    INTO v_qty_left, v_batch_number, v_lot, v_product_name
    FROM batches b
    JOIN products p ON b.product_id = p.id
    WHERE b.id = NEW.batch_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Batch % not found', NEW.batch_id;
    END IF;

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
```

## What This Does

### Script 1 (View Fix):
- Updates the drug journal view to use `qty_left` instead of summing usage_items
- Fixes the negative stock display in reports

### Script 2 (Data Fix):
1. **Sets all negative qty_left to 0** - Acknowledges the overdraft and marks batches as depleted
2. **Adds CHECK constraint** - Prevents qty_left from going negative in the future
3. **Updates error messages** - Provides clear Lithuanian error messages when stock is insufficient

## Expected Results

After running both scripts:

### BioBos Respi 4:
- **Before:** Likutis: -50.4 ml NEIGIAMA
- **After:** Likutis: 0 ml (or positive if other batches have stock)

### Drug Journal Report:
- **Before:** Negative values in "Likutis" column
- **After:** Accurate positive values or 0

### All Inventory Displays:
- ✅ No more negative stock
- ✅ Accurate remaining quantities
- ✅ Future stock overdrafts will be prevented with clear error messages

## Why BioBos Respi 4 Specifically Had This Issue

Looking at the diagnostic:
- Batch 705232BLV had only 19.9 ml received
- But 220 ml was used from it (105 usage_items)
- This caused qty_left to go to -200.1 ml

This likely happened during a period when:
1. The CHECK constraint didn't exist
2. The stock check function wasn't working properly
3. Multiple vaccinations were recorded rapidly without proper stock validation

The CHECK constraint will prevent this from happening again!
