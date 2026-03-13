# 🔴 CRITICAL: Double Stock Deduction Bug!

## The Problem

Stock was being deducted **TWICE**:
1. ✅ Our trigger function manually updates batches (-1ml)
2. ✅ Database trigger `trigger_update_batch_qty_left` also updates batches (-1ml)
3. **Result:** 2ml deducted instead of 1ml!

---

## Why This Happened

The baseline schema already has a built-in trigger that automatically deducts stock whenever a `usage_item` is inserted:

```sql
CREATE TRIGGER trigger_update_batch_qty_left 
AFTER INSERT ON public.usage_items
FOR EACH ROW WHEN (NEW.batch_id IS NOT NULL) 
EXECUTE FUNCTION public.update_batch_qty_left();
```

Our function was **also** doing this manually, causing double deduction!

---

## The Fix

**Removed the manual UPDATE statement** from our function since the database already handles it automatically via the existing trigger.

**Before (Wrong - Double Deduction):**
```sql
INSERT INTO usage_items (...);
UPDATE batches SET qty_left = qty_left - qty;  -- ❌ Manual deduction
-- THEN trigger_update_batch_qty_left fires     -- ❌ Automatic deduction
-- = 2x deduction!
```

**After (Correct - Single Deduction):**
```sql
INSERT INTO usage_items (...);
-- trigger_update_batch_qty_left fires automatically ✅
-- = 1x deduction!
```

---

## 🚀 Apply the Fix

### Option 1: Run Quick Fix SQL
1. Open **Supabase SQL Editor**
2. Copy all of `FIX_DOUBLE_DEDUCTION.sql`
3. Paste and **RUN**

### Option 2: Run Full Migration
1. Open **Supabase SQL Editor**
2. Copy all of `supabase/migrations/20260312000005_add_user_tracking.sql`
3. Paste and **RUN**

Both options apply the same fix!

---

## 🧪 Test It

1. **Note current stock:** Go to **Atsargos**, write down exact amount
2. **Complete a visit:**
   - Enter quantity: `1ml`
   - Mark as "Baigtas"
3. **Check stock again:**
   - Should be reduced by exactly `1ml`
   - ✅ If 96ml → 95ml = CORRECT!
   - ❌ If 96ml → 94ml = Still double deducting (rerun SQL)

---

## 💡 Key Lesson

**Always check for existing triggers before adding manual updates!**

The database already had a sophisticated system:
- `auto_split_usage_items` - Splits usage across multiple batches if needed
- `check_batch_stock` - Validates sufficient stock exists
- `update_batch_qty_left` - **Deducts stock automatically**
- `check_batch_depletion` - Marks batch as depleted when empty

We don't need to manually update batches - the trigger system handles it!

---

## 📋 Files Updated

1. ✅ `supabase/migrations/20260312000005_add_user_tracking.sql` - Fixed
2. ✅ `FIX_DOUBLE_DEDUCTION.sql` - Quick fix SQL

---

## Summary

**Problem:** 1ml usage → 2ml deducted (double deduction)  
**Cause:** Manual UPDATE + automatic trigger  
**Fix:** Removed manual UPDATE, let trigger handle it  
**Result:** 1ml usage → 1ml deducted ✅

Run the SQL fix and test again!
