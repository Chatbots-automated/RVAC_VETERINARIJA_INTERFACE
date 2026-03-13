# 🔴 CRITICAL FIX: Stock Not Deducting for Course Visits

## The Problem
When completing future course visits (kurso planavimas), the stock wasn't being deducted even though the medications were recorded in `usage_items`.

**Root Cause:** The database trigger function `process_visit_medications()` was creating usage records but **forgot to actually subtract from the batch quantity**.

## The Fix
Updated the trigger function in `supabase/migrations/20260312000005_add_user_tracking.sql` to:
1. ✅ Insert into `usage_items` (was working)
2. ✅ **Update batch `qty_left`** (was missing!)

---

## 📋 How to Apply the Fix

### Step 1: Run the Migration SQL
1. Open **Supabase Dashboard** → **SQL Editor**
2. Open file: `supabase/migrations/20260312000005_add_user_tracking.sql`
3. Copy all content
4. Paste into SQL Editor
5. Click **RUN**

**Expected output:** "Success. No rows returned"

---

## 🧪 How to Test

### Test Scenario: Course Treatment

1. **Create a course treatment:**
   - Go to **Gyvūnai** → Click an animal
   - **Vizitai** → **Naujas vizitas**
   - Select **Gydymas** → **Kurso planavimas**
   - Choose a product and set course days (e.g., 3 days)
   - Save

2. **Check initial stock:**
   - Go to **Atsargos** tab
   - Note the current stock level for your product

3. **Complete Day 2 visit:**
   - Go back to the animal
   - Find the future visit for Day 2
   - Click to edit/complete it
   - **Enter the quantity** for the medication
   - Change status to **Baigtas** (Completed)
   - Save

4. **Verify stock was deducted:**
   - Go to **Atsargos** tab
   - Stock should be **reduced** by the quantity you entered
   - ✅ If stock went down = Fix works!
   - ❌ If stock stayed same = Fix not applied

---

## 🔍 What Changed in the Code

**Before (Broken):**
```sql
-- Only created usage_item
INSERT INTO usage_items (...) VALUES (...);
-- ❌ No batch update!
```

**After (Fixed):**
```sql
-- Creates usage_item
INSERT INTO usage_items (...) VALUES (...);

-- ✅ NOW deducts from batch stock
UPDATE batches
SET qty_left = qty_left - quantity
WHERE id = batch_id;
```

---

## ⚠️ Important Notes

### For NEW Course Visits (After Fix):
- ✅ Stock will deduct correctly when you complete each day
- ✅ `usage_items` will be created
- ✅ Batch `qty_left` will decrease

### For OLD Course Visits (Before Fix):
- If you already completed some course visits before this fix
- The `usage_items` were created BUT stock wasn't deducted
- You may need to manually adjust stock levels if discrepancies exist

### Check for Discrepancies:
Run this query to see if there are any usage_items without corresponding stock deductions:

```sql
SELECT 
  ui.id,
  ui.created_at,
  p.name AS product_name,
  ui.qty,
  ui.unit,
  b.qty_left AS current_stock,
  t.reg_date AS treatment_date
FROM usage_items ui
JOIN products p ON ui.product_id = p.id
JOIN batches b ON ui.batch_id = b.id
LEFT JOIN treatments t ON ui.treatment_id = t.id
WHERE ui.created_at > '2026-03-12'  -- Adjust date to when you started testing
ORDER BY ui.created_at DESC;
```

---

## 📋 Quick Checklist

- [ ] Run `supabase/migrations/20260312000005_add_user_tracking.sql` in Supabase
- [ ] Create a new course treatment
- [ ] Note initial stock level
- [ ] Complete a future course visit
- [ ] Verify stock decreased
- [ ] ✅ Fix confirmed working!

---

## Summary

**Files Updated:**
1. `supabase/migrations/20260312000005_add_user_tracking.sql` - Migration file updated with fix

**What it fixes:**
- Stock now deducts when completing course treatment visits
- Batch `qty_left` updates correctly
- Trigger function now matches expected behavior

**Action Required:**
Run the migration SQL in Supabase SQL Editor!
