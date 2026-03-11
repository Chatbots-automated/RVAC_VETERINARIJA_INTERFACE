# How to Apply and Revert the Withdrawal Date Fix

## Problem
The GYDOMŲ GYVŪNŲ REGISTRACIJOS ŽURNALAS report was recalculating withdrawal dates on-the-fly, ignoring manual edits made via ŽURNALAS (Critical Data Editor).

## Solution
We created a migration that changes the view to use stored withdrawal dates from the `treatments` table.

---

## TO APPLY THE FIX:

### Option 1: Via Supabase Dashboard (SAFEST)
1. Go to https://supabase.com/dashboard
2. Select your project
3. Go to SQL Editor
4. Copy and paste the contents of:
   `supabase/migrations/20260213000000_fix_treated_animals_view_use_stored_withdrawal.sql`
5. Click "Run"
6. Verify: Check the GYDOMŲ GYVŪNŲ REGISTRACIJOS ŽURNALAS report - it should now show 2026-02-18

### Option 2: Via Command Line
```bash
# Windows PowerShell
cd c:\Projects\OKSANA_INTERFACE
Get-Content supabase\migrations\20260213000000_fix_treated_animals_view_use_stored_withdrawal.sql | npx supabase db execute --db-url "$env:VITE_SUPABASE_DB_URL"
```

---

## TO REVERT (IF SOMETHING BREAKS):

### Option 1: Via Supabase Dashboard (SAFEST)
1. Go to https://supabase.com/dashboard
2. Select your project
3. Go to SQL Editor
4. Copy and paste the contents of:
   `supabase/migrations/20260213000001_revert_treated_animals_view_to_calculated.sql`
5. Click "Run"
6. The view will go back to recalculating withdrawal dates

### Option 2: Via Command Line
```bash
# Windows PowerShell
cd c:\Projects\OKSANA_INTERFACE
Get-Content supabase\migrations\20260213000001_revert_treated_animals_view_to_calculated.sql | npx supabase db execute --db-url "$env:VITE_SUPABASE_DB_URL"
```

---

## What Changes:

### BEFORE (Current - Broken):
- View calculates: `withdrawal_until_meat = reg_date + product.withdrawal_days_meat`
- ŽURNALAS edits are ignored
- Report shows calculated dates (2026-02-22)

### AFTER (Fixed):
- View uses: `t.withdrawal_until_meat` (stored value from treatments table)
- ŽURNALAS edits are respected
- Report shows manually edited dates (2026-02-18)

---

## Risk Assessment:

### What WILL Change:
✅ The report will now show the correct withdrawal dates that were edited in ŽURNALAS
✅ Manual overrides will be respected going forward

### What WON'T Change:
✅ No tables are modified
✅ No triggers are modified
✅ No functions are modified
✅ Automatic withdrawal calculations still work
✅ All other functionality remains the same

### Safety:
- This is a VIEW-only change (read-only, no data modification)
- If anything breaks, you can instantly revert using the revert migration
- The revert migration restores the exact previous behavior

---

## Verification Steps:

After applying the fix:
1. Go to Ataskaitos → GYDOMŲ GYVŪNŲ REGISTRACIJOS ŽURNALAS
2. Search for cow LT000044228148
3. Check the withdrawal dates - should show 🥩 2026-02-18 (not 2026-02-22)
4. Check other animals to ensure their dates still look correct
5. If anything looks wrong, immediately run the revert migration

---

## Files Created:
- `supabase/migrations/20260213000000_fix_treated_animals_view_use_stored_withdrawal.sql` - The fix
- `supabase/migrations/20260213000001_revert_treated_animals_view_to_calculated.sql` - The revert
- `APPLY_WITHDRAWAL_FIX.md` - This documentation
