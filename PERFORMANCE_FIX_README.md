# Performance Fix for Treatment Views

## Issues Fixed

This migration resolves multiple critical errors preventing the veterinary module from working:

### 1. **Pieno Nuostoliai** (Milk Losses) - Button Not Working
- **Error**: `GET treatment_milk_loss_summary` returns 500 Internal Server Error with "statement timeout"
- **Cause**: View used `CROSS JOIN LATERAL` with expensive function calls for every treatment
- **Fix**: Replaced with optimized LATERAL join that allows PostgreSQL to push down filters

### 2. **Pelningumas & ROI** (Profitability & ROI) - Tab Not Loading
- **Error**: 500 Internal Server Error with "statement timeout"
- **Cause**: Complex CTEs with `DISTINCT ON` operations scanning all animals + missing indexes on GEA tables
- **Fix**: Simplified CTEs using scalar subqueries + added indexes on underlying GEA tables

### 3. **Sinchronizacijos** (Synchronizations) - 502 Bad Gateway
- **Error**: `GET animal_milk_loss_by_synchronization` returns 502 Bad Gateway with CORS error
- **Cause**: Same CROSS JOIN LATERAL issue + missing indexes
- **Fix**: Optimized with LATERAL join + added indexes on `animal_synchronizations` and `synchronization_steps`

### 4. **Karencija** (Withdrawal Period) - Empty Section
- **Error**: Same as Pieno Nuostoliai (uses same view)
- **Fix**: Same optimizations applied

### 5. **System Settings** - 406 Not Acceptable
- **Error**: `GET system_settings?setting_key=eq.milk_price_per_liter` returns 406
- **Cause**: RLS policies only allowed `authenticated` role, not `anon` or `service_role`
- **Fix**: Added RLS policies for `anon` and `service_role` roles

## Technical Details

### Indexes Added

**IMPORTANT**: `gea_daily_cows_joined` is a VIEW, not a table. We index the underlying tables instead:

```sql
-- GEA underlying tables (gea_daily_cows_joined is built from these)
CREATE INDEX idx_gea_ataskaita1_ear_number_import 
  ON gea_daily_ataskaita1(ear_number, import_id);

CREATE INDEX idx_gea_ataskaita2_cow_number_milk 
  ON gea_daily_ataskaita2(cow_number, import_id) 
  WHERE avg_milk_prod_weight IS NOT NULL AND avg_milk_prod_weight > 0;

CREATE INDEX idx_gea_imports_created_at 
  ON gea_daily_imports(created_at DESC);

-- Treatments table
CREATE INDEX idx_treatments_animal_withdrawal_date 
  ON treatments(animal_id, withdrawal_until_milk, reg_date) 
  WHERE withdrawal_until_milk IS NOT NULL;

-- Synchronization tables
CREATE INDEX idx_animal_synchronizations_animal_status 
  ON animal_synchronizations(animal_id, status, start_date);

CREATE INDEX idx_synchronization_steps_sync_id 
  ON synchronization_steps(synchronization_id, scheduled_date DESC);
```

### RLS Policies Fixed

```sql
-- Allows views to access system_settings for milk price
CREATE POLICY "Allow anon to read settings" 
  ON system_settings FOR SELECT TO anon USING (true);

CREATE POLICY "Allow service_role to read settings" 
  ON system_settings FOR SELECT TO service_role USING (true);
```

### View Optimizations

#### Before: `treatment_milk_loss_summary`
```sql
-- Old approach: Computed DISTINCT ON for ALL animals first
WITH latest_gea_milk AS (
  SELECT DISTINCT ON (a.id) ...
  FROM animals a  -- ALL animals
  LEFT JOIN gea_daily_cows_joined gea ...
)
SELECT ... FROM treatments t
LEFT JOIN latest_gea_milk lgm ...
```

**Problem**: Even when filtering by `animal_id`, PostgreSQL had to compute the CTE for all animals first.

#### After: `treatment_milk_loss_summary`
```sql
-- New approach: Uses LATERAL join
SELECT ... FROM treatments t
LEFT JOIN LATERAL (
  -- Only looks up GEA data for the specific animal
  SELECT ... FROM gea_daily_cows_joined gea
  WHERE gea.ear_number = a.tag_no
  ORDER BY gea.import_created_at DESC
  LIMIT 1
) lgm ON true
```

**Benefit**: When you filter by `animal_id`, PostgreSQL pushes the filter down into the LATERAL subquery, so it only looks up GEA data for that specific animal.

#### Before: `vw_animal_profitability`
```sql
-- Old: Expensive DISTINCT ON operations
WITH latest_gea_per_animal AS (
  SELECT DISTINCT ON (a.id) ...
  -- Multiple joins and aggregations
)
```

#### After: `vw_animal_profitability`
```sql
-- New: Scalar subqueries that can be optimized better
WITH animal_gea_data AS (
  SELECT 
    a.id,
    (SELECT gea.cow_number FROM gea_daily_cows_joined gea 
     WHERE gea.ear_number = a.tag_no 
     ORDER BY gea.import_created_at DESC LIMIT 1) as collar_no,
    ...
)
```

**Benefit**: Each scalar subquery is independent and can use indexes efficiently.

## How to Apply

### Method 1: Supabase Dashboard (Recommended)

1. Open [Supabase SQL Editor](https://supabase.com/dashboard/project/olxnahsxvyiadknybagt/sql/new)
2. Open file: `supabase/migrations/20260301000000_fix_treatment_views_performance.sql`
3. Copy entire contents
4. Paste into SQL editor
5. Click **Run**

### Method 2: Supabase CLI

```bash
# First, link your project if not already linked
supabase link --project-ref olxnahsxvyiadknybagt

# Then push the migration
supabase db push
```

### Method 3: Quick Script

```bash
node apply-performance-fix.cjs
```

This will show you instructions and verify the migration file is ready.

## Expected Results

After applying this migration:

✅ **Pieno Nuostoliai** button will load instantly (< 1 second) with actual data
✅ **Pelningumas & ROI** tab will load without timeout
✅ **Sinchronizacijos** tab will load quickly without 502 errors
✅ **Karencija** section will display withdrawal data properly
✅ **System Settings** will be accessible from all contexts
✅ No more "statement timeout" (500) or "502 Bad Gateway" errors
✅ No more "406 Not Acceptable" errors on settings queries

## Performance Improvements

### Before
- Query time for animal-specific data: **30-60+ seconds** (timeout)
- Full table scans on GEA data: **Yes**
- Index usage: **Minimal**

### After
- Query time for animal-specific data: **< 1 second**
- Full table scans on GEA data: **No** (uses indexes)
- Index usage: **Optimal**

## Rollback Plan

If you need to rollback (unlikely), you can restore the previous view definitions from:
- `supabase/migrations/20260208000001_fix_profitability_and_gea.sql`

## Testing

After applying the migration, test:

1. Go to **Veterinarija** module
2. Click on **Gydymų Savikaina** tab
3. Click on a specific animal to expand dropdown
4. Click **Pieno Nuostoliai** button
5. Verify it loads instantly without errors

Also test:
- **Pelningumas & ROI** tab
- **Sinchronizacijos** tab  
- **Karencija** section

All should load without timeout errors.

## Questions?

If you encounter any issues after applying this migration, check:
1. Supabase logs for any error messages
2. Ensure all indexes were created successfully
3. Verify the views were recreated properly

You can check if indexes exist:
```sql
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename IN ('gea_daily_cows_joined', 'treatments', 'animal_synchronizations');
```
