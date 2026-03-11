# GEA Daily Import System Integration

## Overview
Integrated the new GEA Daily import system with the existing Animal Detail Sidebar, providing backwards compatibility with the old `gea_daily` table.

## Database Changes

### New Tables Created
1. **`gea_daily_imports`** - Import batch tracking
   - Stores metadata about each import (filename, SHA256, counts)
   - Tracks markers (i1, i2, i3) for import identification

2. **`gea_daily_ataskaita1`** - Pregnancy & Lactation Data
   - `cow_number`, `ear_number`, `cow_state`, `group_number`
   - `pregnant_since`, `lactation_days`, `inseminated_at`, `pregnant_days`
   - `next_pregnancy_date`, `days_until_waiting_pregnancy`
   - Raw JSONB for full data preservation

3. **`gea_daily_ataskaita2`** - Milking Data
   - `cow_number`, `genetic_worth`, `blood_line`
   - `avg_milk_prod_weight`, `produce_milk`
   - `last_milking_date`, `last_milking_time`, `last_milking_weight`
   - **`milkings` JSONB array** - stores up to 9 milkings with date/time/weight
   - Raw JSONB for full data preservation

4. **`gea_daily_ataskaita3`** - Teat & Insemination Data
   - `cow_number`
   - Teat status: `teat_missing_right_back`, `teat_missing_back_left`, etc.
   - `insemination_count`, `bull_1`, `bull_2`, `bull_3`
   - `lactation_number`
   - Raw JSONB for full data preservation

### View Created
**`gea_daily_cows_joined`** - Joins all three ataskaita tables
- Provides unified view of all GEA data per cow
- Uses `cow_number` as primary key
- Left joins ensure data appears even if only in one table

### Functions Created

#### Safe Cast Functions (Handle GEA's "******" placeholders)
1. **`safe_date(text)`** - Safely parse dates from various formats
2. **`safe_int(text)`** - Safely parse integers, ignoring "***" and "N/A"
3. **`safe_numeric(text)`** - Safely parse decimals, handling commas and "***"
4. **`safe_bool_lt(text)`** - Parse Lithuanian boolean values (Taip/Ne)

#### Upload RPC
**`gea_daily_upload(jsonb)`** - Main upload function
- Security definer (runs with elevated privileges)
- Accepts payload with meta + 3 ataskaita arrays
- Uses safe cast functions to prevent numeric casting errors
- Returns import_id and counts
- Handles upserts (on conflict do update)

## Frontend Integration

### AnimalDetailSidebar.tsx Updates

#### Data Loading Strategy
```typescript
// 1. Try new GEA system first (gea_daily_cows_joined)
// 2. Store raw data for comprehensive display
// 3. Transform to old format for backwards compatibility
// 4. Fallback to old gea_daily table if new data not found
```

#### New Comprehensive Display (3-Section Tabs)
When using the new GEA system, the card shows:

**Tab 1: 1-oji Ataskaita (Veršingumas/Pregnancy)**
- Ear number, status, group
- Lactation days
- Insemination date, pregnant since
- Pregnancy days
- Next pregnancy date
- Days until expected pregnancy

**Tab 2: 2-oji Ataskaita (Melžimas/Milking)**
- Genetic worth, blood line
- Average milk production weight
- Produces milk status
- Last milking date/time/weight
- **ALL milkings** displayed in scrollable list (up to 9)
- Each milking shows: index, date, time, weight

**Tab 3: 3-oji Ataskaita (Speniai/Veisimas/Teats & Breeding)**
- **Teat Status Grid**: Visual 4-quadrant display
  - Front left/right
  - Back left/right
  - Color coded: Red (missing) / Green (OK)
- **Insemination Info**:
  - Insemination count
  - Lactation number
  - Bull #1, #2, #3 (breeding bulls used)

#### Field Mapping (New → Old)
```typescript
{
  // Basic info
  statusas: cow_state,
  grupe: group_number (parsed as int),
  veisline_verte: genetic_worth,
  milk_avg: avg_milk_prod_weight,
  in_milk: produce_milk,
  
  // Dates
  lact_days: lactation_days,
  inseminated_on: inseminated_at,
  kada_versiuosis: next_pregnancy_date,
  snapshot_date: import_created_at,
  
  // Milkings (JSONB array → individual columns)
  m1_date: milkings[0].date,
  m1_time: milkings[0].time,
  m1_qty: milkings[0].weight,
  // ... m2 through m5
}
```

#### Realtime Updates
- Subscribes to both `gea_daily` (old) and `gea_daily_imports` (new)
- Reloads data when new import detected
- Maintains APSĖK status change detection

## Migration Files Created

1. **`20260204000000_create_gea_daily_import_system.sql`**
   - Creates all 3 ataskaita tables
   - Creates gea_daily_imports table
   - Creates gea_daily_cows_joined view
   - Sets up indexes for performance

2. **`20260204000001_create_gea_daily_safe_cast_functions.sql`**
   - Creates 4 safe cast helper functions
   - Grants execute permissions to authenticated users

3. **`20260204000002_create_gea_daily_upload_rpc.sql`**
   - Creates main upload RPC function
   - Sets security definer
   - Grants execute to authenticated users
   - Notifies PostgREST to reload schema

## Key Features

### Backwards Compatibility
- ✅ Old `gea_daily` table still works
- ✅ New system automatically used when available
- ✅ Seamless transition - no UI changes needed
- ✅ Data transformation happens transparently

### Data Safety
- ✅ Handles GEA's "******" placeholders safely
- ✅ No implicit numeric casting errors
- ✅ Preserves raw data in JSONB for debugging
- ✅ Unique constraints prevent duplicates

### Performance
- ✅ Indexed on cow_number for fast lookups
- ✅ GIN index on milkings JSONB for efficient queries
- ✅ View provides pre-joined data
- ✅ Realtime subscriptions for live updates

## Usage

### Uploading GEA Data
```javascript
const payload = {
  meta: {
    counts: { ataskaita1: 100, ataskaita2: 100, ataskaita3: 100 },
    markers: { i1: 1, i2: 2, i3: 3 }
  },
  ataskaita1: [ /* array of cow pregnancy/lactation data */ ],
  ataskaita2: [ /* array of cow milking data */ ],
  ataskaita3: [ /* array of cow teat/insemination data */ ]
};

const { data, error } = await supabase.rpc('gea_daily_upload', { payload });
// Returns: { import_id: 'uuid', counts: {...} }
```

### Querying GEA Data
```sql
-- Get latest data for a cow
SELECT * FROM gea_daily_cows_joined
WHERE cow_number = 'LT825'
ORDER BY import_created_at DESC
LIMIT 1;

-- Get all milkings for a cow
SELECT 
  cow_number,
  jsonb_array_elements(milkings) as milking
FROM gea_daily_ataskaita2
WHERE cow_number = 'LT825';
```

## Testing Checklist

- [ ] Upload GEA data via RPC
- [ ] Verify data appears in all 3 ataskaita tables
- [ ] Check gea_daily_cows_joined view returns correct data
- [ ] Open animal detail sidebar for cow with new GEA data
- [ ] Verify GEA card displays correctly
- [ ] Check milkings array displays properly
- [ ] Verify APSĖK status detection works
- [ ] Test realtime updates when new import happens
- [ ] Confirm backwards compatibility with old gea_daily
- [ ] Test with cows that have "******" in numeric fields

## Benefits

### For Data Import
- **Robust**: Handles malformed data gracefully
- **Safe**: No more numeric casting errors
- **Traceable**: Every import tracked with metadata
- **Auditable**: Raw data preserved in JSONB

### For Users
- **Seamless**: No UI changes required
- **Fast**: Indexed queries, pre-joined views
- **Realtime**: Live updates when data imported
- **Reliable**: Backwards compatible fallback

### For Developers
- **Clean**: Well-structured normalized tables
- **Flexible**: JSONB for variable-length data
- **Maintainable**: Clear separation of concerns
- **Documented**: Comprehensive migration files

## Future Enhancements

1. **Data Validation Dashboard**
   - Show import history
   - Display parsing errors/warnings
   - Compare imports over time

2. **Automatic Sync**
   - Scheduled imports from GEA system
   - Email notifications on import
   - Error alerting

3. **Analytics**
   - Milk production trends from milkings array
   - Pregnancy success rates
   - Teat health tracking

4. **Data Export**
   - Export to Excel/CSV
   - Custom date ranges
   - Filtered by cow groups

## Notes

- Migration files are timestamped `20260204` (Feb 4, 2026)
- All functions use `security definer` for proper permissions
- JSONB used for flexible schema evolution
- Unique indexes prevent duplicate imports per cow
- View automatically updates when underlying tables change
