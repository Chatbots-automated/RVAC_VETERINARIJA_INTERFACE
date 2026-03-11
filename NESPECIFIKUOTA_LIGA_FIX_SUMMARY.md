# "Nespecifikuota liga" Issue - Complete Analysis & Fix

## Quick Start

**To fix this issue:**
1. Go to Supabase Dashboard → SQL Editor
2. Run: `supabase/migrations/20260213000002_fix_process_visit_medications_copy_disease.sql`
3. Done! Future course visits will now show correct disease names.

**To diagnose:**
- Run `diagnose-nespecifikuota-liga.sql` to see affected records

**To fix historical data (optional):**
- Run `fix-existing-nespecifikuota-liga.sql` (review preview first!)

---

## The Problem

In the "GYDOMŲ GYVŪNŲ REGISTRACIJOS ŽURNALAS" report, many rows show "Nespecifikuota liga" instead of the actual disease name. 

**Client confirmed**: They **always enter the disease** when creating treatments, so this is NOT user error.

## Root Cause Analysis

### How Disease Names Work

The report view uses this logic to determine disease name:

```sql
COALESCE(
    d.name,                                    -- 1. From diseases table (via disease_id)
    NULLIF(TRIM(t.clinical_diagnosis), ''),   -- 2. From clinical_diagnosis field
    NULLIF(TRIM(t.animal_condition), ''),     -- 3. From animal_condition field
    'Nespecifikuota liga'                      -- 4. Fallback when all above are empty
) AS disease_name
```

### The Bug - Step by Step

When users create treatment courses using "Kurso planavimas" (course planner):

**Day 1 (First visit)**: ✅ Works correctly
```
User creates course → Selects disease "Mastitas" → Creates visit
    ↓
Treatment record created:
    disease_id: abc-123 (Mastitas)
    clinical_diagnosis: "..."
    ↓
Future visits created:
    related_treatment_id: points to Day 1 treatment
    planned_medications: [...]
    ↓
Report shows: "Mastitas" ✅
```

**Day 2+ (Future visits)**: ❌ Bug occurs
```
User completes Day 2 visit → Trigger fires
    ↓
Trigger checks: Does treatment exist? NO
    ↓
Trigger creates NEW treatment:
    disease_id: NULL ❌ (should copy from related_treatment_id)
    clinical_diagnosis: NULL ❌ (should copy from related_treatment_id)
    notes: "Auto-created from course visit completion"
    ↓
Trigger creates usage_items (medications)
    ↓
Report shows: "Nespecifikuota liga" ❌
```

**The Issue**: The trigger creates a new treatment but doesn't look at `related_treatment_id` to copy disease information.

### The Trigger Code (Current - BROKEN)

```sql
-- From process_visit_medications() function
IF v_treatment_id IS NULL AND NEW.treatment_required THEN
  INSERT INTO treatments (
    animal_id,
    visit_id,
    reg_date,
    vet_name,
    notes
  ) VALUES (
    NEW.animal_id,
    NEW.id,
    DATE(NEW.visit_datetime),
    NEW.vet_name,
    'Auto-created from course visit completion'
  )
  RETURNING id INTO v_treatment_id;
END IF;
```

**Missing fields**: `disease_id`, `clinical_diagnosis`, `animal_condition`, `tests`, `services`

## The Fix

Update the `process_visit_medications()` trigger to:
1. Check if visit has `related_treatment_id`
2. Copy disease information from the related treatment
3. Use that information when creating the new treatment record

### Migration File

`supabase/migrations/20260213000002_fix_process_visit_medications_copy_disease.sql`

This migration updates the trigger to copy all relevant fields from the related treatment.

## How to Apply

### Step 1: Apply the Migration

**Via Supabase Dashboard:**
1. Go to SQL Editor
2. Copy contents of `20260213000002_fix_process_visit_medications_copy_disease.sql`
3. Run it

**Via Supabase CLI:**
```bash
supabase db push
```

### Step 2: Verify

```sql
-- Check if function was updated
SELECT pg_get_functiondef(oid) 
FROM pg_proc 
WHERE proname = 'process_visit_medications';
```

Should see the new version with `v_related_treatment` variable and disease copying logic.

### Step 3: Test

1. Create a new treatment course with disease selected
2. Complete a future visit from that course
3. Check the report - should show correct disease name

## Optional: Fix Historical Data

If you want to fix existing records with "Nespecifikuota liga":

1. Run `diagnose-nespecifikuota-liga.sql` to see affected records
2. Review the preview in `fix-existing-nespecifikuota-liga.sql`
3. If it looks good, uncomment and run the UPDATE statement

**Note**: This is optional. The main fix prevents future occurrences.

## Impact Assessment

- **Risk**: LOW - only modifies trigger function, no table structure changes
- **Reversible**: YES - revert migration provided (`20260213000003_revert_process_visit_medications.sql`)
- **Affects**: Only future visit completions from treatment courses
- **Does NOT affect**: 
  - Single treatments (not courses)
  - Existing completed treatments
  - Synchronization protocols
  - Vaccinations, prevention, etc.

## Files Changed

1. **Database**:
   - `supabase/migrations/20260213000002_fix_process_visit_medications_copy_disease.sql` - The fix
   - `supabase/migrations/20260213000003_revert_process_visit_medications.sql` - Revert if needed

2. **Frontend** (reverted - not needed):
   - No frontend changes needed - the bug is in the database trigger

3. **Diagnostic Scripts**:
   - `diagnose-nespecifikuota-liga.sql` - Analyze the issue
   - `fix-existing-nespecifikuota-liga.sql` - Optional: fix historical data
   - `check-nespecifikuota-liga.sql` - Simple check
   - `check-specific-treatment.sql` - Check specific animal/date

## Why This Happens

The client is correct - they DO enter the disease every time. The disease is stored correctly in the **first treatment** of the course. The bug is that when **subsequent days** of the course are completed, the trigger creates **new treatment records** but forgets to copy the disease information from the original treatment.

This is a database-level bug, not a user error.
