# Fix "Nespecifikuota liga" in Treatment Course Reports

## Problem

When treatment courses are created using "Kurso planavimas" (course planner), the first visit gets a proper treatment record with `disease_id`. However, when future visits from the course are completed, the database trigger `process_visit_medications()` creates new treatment records **without copying the disease information** from the original treatment.

This causes "Nespecifikuota liga" to appear in the "GYDOMŲ GYVŪNŲ REGISTRACIJOS ŽURNALAS" report for all subsequent days of the course.

## Root Cause

The `process_visit_medications()` trigger function (lines 2561-2578 in schema_latest_public.sql) creates treatment records with only:
- `animal_id`
- `visit_id`
- `reg_date`
- `vet_name`
- `notes`

It's missing:
- `disease_id` ❌
- `clinical_diagnosis` ❌
- `animal_condition` ❌
- `tests` ❌
- `services` ❌

## Solution

Update the trigger to:
1. Check if the visit has `related_treatment_id` (course visits have this)
2. Copy disease and clinical information from the related treatment
3. Use that information when creating the new treatment record

## How to Apply

### Option 1: Via Supabase Dashboard (Recommended)

1. Go to Supabase Dashboard → SQL Editor
2. Copy the contents of `supabase/migrations/20260213000002_fix_process_visit_medications_copy_disease.sql`
3. Run it
4. Verify success (should see "Success. No rows returned")

### Option 2: Via Supabase CLI

```bash
supabase db push
```

This will apply all pending migrations including this one.

## Verification

After applying, run this query to test:

```sql
-- Check if the function was updated
SELECT 
    pg_get_functiondef(oid) 
FROM pg_proc 
WHERE proname = 'process_visit_medications';
```

You should see the new version that includes:
- `v_related_treatment record;` in DECLARE section
- Logic to SELECT from related treatment
- INSERT statement with disease_id, clinical_diagnosis, etc.

## Impact

- **Scope**: Only affects future visit completions from treatment courses
- **Risk**: LOW - only modifies a trigger function, no table structure changes
- **Reversible**: YES - revert migration provided
- **Data**: Does NOT fix existing "Nespecifikuota liga" records (only prevents new ones)

## To Revert

If something goes wrong, run:

```bash
# Via Supabase Dashboard SQL Editor
# Copy and run: supabase/migrations/20260213000003_revert_process_visit_medications.sql
```

This restores the original function.

## Testing

1. Create a new treatment course with "Kurso planavimas"
2. Select a disease (e.g., "Mastitas")
3. Complete the first visit
4. Complete a future visit from the course
5. Check "GYDOMŲ GYVŪNŲ REGISTRACIJOS ŽURNALAS" report
6. Verify the disease name appears correctly (not "Nespecifikuota liga")

## Notes

- This fix does NOT update existing records with "Nespecifikuota liga"
- To fix existing records, you would need to manually update the `treatments` table
- The frontend validation added in `AnimalDetailSidebar.tsx` will prevent new treatments from being created without disease info
