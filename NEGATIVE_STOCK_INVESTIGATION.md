# Negative Stock Investigation & Fix

## Date: 2026-02-11

## Problem Report

The "Gydymų Savikaina" → "Vaistų Panaudojimas" section was showing negative stock for multiple products, including:

**Example: Ymcp Bolus**
- Viso gauta: 180 bolus
- Panaudota: 304 bolus  
- **Likutis: −124 bolus** ❌

## Investigation

### Diagnostic Results

Running `diagnose-ymcp-bolus.js` revealed the following:

#### Actual Database State (Source of Truth)
```
Batch 1 (2026-01-31): Received 60, Qty Left 20, Used 40 ✅
Batch 2 (2025-12-08): Received 60, Qty Left 0, Used 60
Batch 3 (2025-11-11): Received 60, Qty Left 0, Used 60

TOTAL: Received 180, Qty Left 20, Actually Used 160 ✅
```

#### Usage Records in Database
```
Usage Items: 102 records totaling 310 bolus ❌
- Batch 1: 16 items = 40 bolus (matches DB qty_left) ✅
- Batch 2: 39 items = 125 bolus (DB shows only 60 used) ❌ +65 discrepancy
- Batch 3: 47 items = 145 bolus (DB shows only 60 used) ❌ +85 discrepancy

TOTAL DISCREPANCY: 150 bolus
```

### Root Cause

1. **Historical Data Issue**: At some point in the past, `usage_items` records were created that attempted to deduct more stock than was available in batches 2 and 3.

2. **Database Trigger Behavior**: The `update_batch_qty_left()` trigger correctly deducts stock:
   ```sql
   UPDATE batches
   SET qty_left = qty_left - NEW.qty,
       status = CASE WHEN (qty_left - NEW.qty) <= 0 THEN 'depleted' ELSE status END
   WHERE id = NEW.batch_id;
   ```
   
   However, the `batches` table does NOT have a CHECK constraint on `qty_left` (unlike `equipment_batches`), so `qty_left` could have gone negative temporarily.

3. **Stock Check Function**: The `check_batch_stock()` function was added later to prevent overdraft, but it didn't fix historical discrepancies.

4. **Display Issue**: The `ProductUsageAnalysis` component was **recalculating** stock by:
   - Summing all `usage_items.qty` (310 bolus) ❌
   - Subtracting from `batches.received_qty` (180 bolus)
   - Result: -130 bolus ❌
   
   Instead of using the **accurate** `batches.qty_left` maintained by database triggers (20 bolus) ✅

## The Fix

### Changes to `ProductUsageAnalysis.tsx`

**Issue 1: Not fetching `qty_left` from database**

**Before:**
```typescript
const batches = await fetchAllRows<any>('batches', 'id, product_id, purchase_price, received_qty, created_at, supplier_id');
// ❌ Missing qty_left field!
```

**After:**
```typescript
const batches = await fetchAllRows<any>('batches', 'id, product_id, purchase_price, received_qty, qty_left, created_at, supplier_id');
// ✅ Now fetching qty_left
```

**Issue 2: Incorrect calculation logic**

**Before:**
```typescript
record.total_received = productBatches.reduce((sum, b) => sum + (b.received_qty || 0), 0);
record.total_used = record.total_quantity; // ❌ Sum of usage records
record.remaining_stock = record.total_received - record.total_used; // ❌ Incorrect calculation
```

**After:**
```typescript
record.total_received = productBatches.reduce((sum, b) => sum + (b.received_qty || 0), 0);

// CRITICAL FIX: Use qty_left from batches as the source of truth
const actualRemainingStock = productBatches.reduce((sum, b) => sum + (b.qty_left || 0), 0);
record.total_used = record.total_received - actualRemainingStock; // ✅ Calculated from qty_left
record.remaining_stock = actualRemainingStock; // ✅ From database
```

### Display Changes

The inventory section now shows:
- **Viso gauta**: Total received from all batches (accurate)
- **Panaudota**: Calculated as `received - qty_left` (accurate, reflects actual stock deduction)
- **Likutis**: Direct from `batches.qty_left` (accurate, maintained by triggers)
- **Panaudota (filtruota)**: Only shown when date filters are applied (sum of filtered usage records)

## Impact

### Before Fix
- ❌ Showed negative stock for products with historical data discrepancies
- ❌ Confused users about actual inventory levels
- ❌ Made it appear that more product was used than received

### After Fix
- ✅ Shows accurate remaining stock from database
- ✅ "Panaudota" reflects actual stock deduction (160 bolus, not 310)
- ✅ "Likutis" shows correct remaining inventory (20 bolus, not -124)
- ✅ Users can trust the inventory numbers

## Why Historical Discrepancies Exist

The 150 bolus discrepancy in usage records vs. actual stock deduction likely occurred due to:

1. **Race conditions** during high-volume usage recording
2. **Missing stock check** before the `check_batch_stock()` function was implemented
3. **Data migration issues** when the system was being developed
4. **Manual corrections** that adjusted `qty_left` without deleting corresponding usage records

## Critical Finding: Actual Negative qty_left in Database

While investigating BioBos Respi 4, we discovered that some batches have **ACTUAL negative qty_left values** in the database:

**Example: BioBos Respi 4 - Batch 705232BLV**
- Received: 19.9 ml
- Qty Left: **-200.1 ml** ⚠️ (actually negative in DB!)
- Used: 220 ml (more than received!)

This is different from the Ymcp Bolus issue. Here, the database itself has negative values because:
1. The `batches` table has NO CHECK constraint on `qty_left` (unlike `equipment_batches`)
2. The trigger allowed `qty_left` to go negative when stock was over-used
3. Multiple vaccinations were recorded that exceeded available stock

## Recommendation - CRITICAL FIX REQUIRED

**You MUST run these SQL scripts in Supabase to fix the issue:**

See `APPLY_STOCK_FIXES.md` for detailed instructions.

### Quick Fix:

1. **Fix negative qty_left values:**
   ```sql
   UPDATE batches SET qty_left = 0, status = 'depleted' WHERE qty_left < 0;
   ```

2. **Add CHECK constraint** to prevent future negatives:
   ```sql
   ALTER TABLE batches ADD CONSTRAINT batches_qty_left_check CHECK (qty_left >= 0);
   ```

3. **Fix the drug journal view** (see APPLY_STOCK_FIXES.md)

### Why This Is Critical

- ✅ The code fixes I made are correct - they use `qty_left` as source of truth
- ❌ But some `qty_left` values are actually negative in the database
- ⚠️  Without the CHECK constraint, this can happen again
- 🔧 After running the SQL fixes, ALL stock displays will be accurate

## Files Modified

1. `src/components/ProductUsageAnalysis.tsx` - Fixed inventory calculation logic in "Vaistų Panaudojimas" section
2. `src/components/Inventory.tsx` - Fixed inventory calculation logic in "Atsargos" section  
3. `src/components/AnimalDetailSidebar.tsx` - Fixed stock calculation in animal sidebar (profilaktika product selection)
4. `src/components/Dashboard.tsx` - Fixed total inventory value calculation
5. `supabase/migrations/20260213000000_fix_vet_drug_journal_view.sql` - Fixed database view for drug journal report
6. `diagnose-product-stock.js` - Diagnostic script (can be used for any product)

## Additional Fix: Inventory (Atsargos) Component

The same issue existed in the `Inventory.tsx` component, which displays the "Atsargos" (Stock) list.

**Before:**
```typescript
// Get total usage for this batch
const { data: usageData } = await supabase
  .from('usage_items')
  .select('qty')
  .eq('batch_id', batch.id);

const totalUsed = usageData?.reduce((sum, item) => sum + (item.qty || 0), 0) || 0;
const onHand = (batch.received_qty || 0) - totalUsed; // ❌ WRONG!
```

**After:**
```typescript
// Fetch qty_left from batches
const { data: batchesData } = await supabase
  .from('batches')
  .select('id, product_id, lot, expiry_date, mfg_date, received_qty, qty_left, ...')

// Use qty_left directly
const batchesWithStock = batchesData?.map((batch) => ({
  ...
  on_hand: batch.qty_left || 0, // ✅ Use qty_left from database
  ...
}))
```

## Testing

To verify the fix:

### 1. Vaistų Panaudojimas Section
1. Navigate to "Gydymų Savikaina" → "Vaistų Panaudojimas"
2. Find Ymcp Bolus (or any product that previously showed negative stock)
3. Expand the product details
4. Verify:
   - ✅ Viso gauta: 180 bolus
   - ✅ Panaudota: 160 bolus (not 310)
   - ✅ Likutis: 20 bolus (not -124)

### 2. Atsargos (Inventory) Section
1. Navigate to "Atsargos"
2. Find Ymcp Bolus in the list
3. Verify:
   - ✅ Likutis: 20 bolus (not -130 or other negative value)
   - ✅ No "NEIGIAMA" (negative) badge displayed

### 3. Animal Sidebar - Profilaktika Section
1. Open any animal's detail sidebar
2. Select "Profilaktika" procedure
3. Select Ymcp Bolus from the product dropdown
4. Verify:
   - ✅ Likutis: 20.00 bolus (not -130.00)
   - ✅ Stock level displayed in green (not red)

### 4. Dashboard - Inventory Value
1. Navigate to Dashboard
2. Check the inventory statistics
3. Verify:
   - ✅ Total inventory value is calculated using accurate qty_left values
   - ✅ Stock counts reflect actual remaining inventory

### 5. Drug Journal Report (VETERINARINIŲ VAISTŲ ŽURNALAS)
1. Navigate to Reports → Drug Journal
2. Generate the report (clear date filters to see all data)
3. Find MastoBol or Ymcp Bolus in the report
4. Verify:
   - ✅ "Likutis" (Remaining) column shows positive values
   - ✅ No negative stock amounts displayed
   - ✅ Totals at bottom match actual inventory

**IMPORTANT:** This fix requires a database migration. Run the following SQL in Supabase SQL Editor:

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
  -- FIXED: Use qty_left as source of truth (maintained by database triggers)
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
