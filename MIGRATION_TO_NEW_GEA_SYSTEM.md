# Migration to New GEA System - Complete Guide

## 🎯 What This Does

This migration **completely replaces** the old `gea_daily` table with a new, more powerful GEA import system.

### Before (Old System)
- ❌ Single `gea_daily` table
- ❌ Limited to 5 milkings
- ❌ No teat status tracking
- ❌ No breeding history
- ❌ Simple flat structure

### After (New System)
- ✅ 3 separate tables for organized data
- ✅ Unlimited milkings (stored as JSONB array)
- ✅ Complete teat status with visual grid
- ✅ Full breeding history (3 bulls)
- ✅ Beautiful 3-tab interface
- ✅ Better data validation with safe cast functions

---

## 📋 Migration Steps

### Step 1: Apply All 4 Migration Files (IN ORDER!)

Run these in Supabase SQL Editor, **one at a time, in this exact order**:

#### 1️⃣ Create new tables and view
```
supabase/migrations/20260204000000_create_gea_daily_import_system.sql
```
Creates:
- `gea_daily_imports` (import metadata)
- `gea_daily_ataskaita1` (pregnancy/lactation)
- `gea_daily_ataskaita2` (milking data)
- `gea_daily_ataskaita3` (teat/breeding)
- `gea_daily_cows_joined` (view)

#### 2️⃣ Create safe cast functions
```
supabase/migrations/20260204000001_create_gea_daily_safe_cast_functions.sql
```
Creates helper functions:
- `safe_date(text)` - Handles "******" and invalid dates
- `safe_int(text)` - Handles "******" and invalid integers
- `safe_numeric(text)` - Handles "******" and invalid decimals
- `safe_bool_lt(text)` - Converts "Taip"/"Ne" to boolean

#### 3️⃣ Create upload RPC function
```
supabase/migrations/20260204000002_create_gea_daily_upload_rpc.sql
```
Creates:
- `gea_daily_upload(payload jsonb)` - Main upload function
- Permissions and security settings
- Schema reload trigger

#### 4️⃣ Drop old table (POINT OF NO RETURN!)
```
supabase/migrations/20260204000003_drop_old_gea_daily_table.sql
```
⚠️ **WARNING**: This will:
- Drop the old `gea_daily` table permanently
- Remove all legacy GEA data
- Force everyone to use the new system

**Before running this:**
- ✅ Make sure steps 1-3 completed successfully
- ✅ Export any old data you want to keep
- ✅ Test the new upload function works
- ✅ Inform your team about the change

---

### Step 2: Upload GEA Data

After migrations are applied, you MUST use the new upload function.

#### Option A: Via SQL (for testing)

```sql
SELECT gea_daily_upload('{
  "meta": {
    "counts": {"ataskaita1": 1, "ataskaita2": 1, "ataskaita3": 1},
    "markers": {"i1": 1, "i2": 2, "i3": 3}
  },
  "ataskaita1": [{
    "cow_number": "LT825",
    "ear_number": "825",
    "cow_state": "MELŽ",
    "group_number": "1",
    "pregnant_since": null,
    "lactation_days": 120,
    "inseminated_at": null,
    "pregnant_days": null,
    "next_pregnancy_date": null,
    "days_until_waiting_pregnancy": null
  }],
  "ataskaita2": [{
    "cow_number": "LT825",
    "genetic_worth": "VG-85",
    "blood_line": "Holstein",
    "avg_milk_prod_weight": "28.5",
    "produce_milk": "Taip",
    "last_milking_date": "2026-02-04",
    "last_milking_time": "06:30",
    "last_milking_weight": "14.2",
    "milking_date_1": "2026-02-04",
    "milking_time_1": "06:30",
    "milking_weight_1": "14.2",
    "milking_date_2": "2026-02-03",
    "milking_time_2": "18:15",
    "milking_weight_2": "13.8"
  }],
  "ataskaita3": [{
    "cow_number": "LT825",
    "teat_missing_right_back": "Ne",
    "teat_missing_back_left": "Ne",
    "teat_missing_front_left": "Ne",
    "teat_missing_front_right": "Ne",
    "insemination_count": 1,
    "bull_1": "BULL-2024-A",
    "bull_2": null,
    "bull_3": null,
    "lactation_number": 2
  }]
}'::jsonb);
```

**Important:** Replace `"LT825"` with actual `tag_no` values from your `animals` table!

#### Option B: Via JavaScript/TypeScript

```typescript
const { data, error } = await supabase.rpc('gea_daily_upload', { 
  payload: {
    meta: {
      counts: { ataskaita1: 1, ataskaita2: 1, ataskaita3: 1 },
      markers: { i1: 1, i2: 2, i3: 3 }
    },
    ataskaita1: [/* your data */],
    ataskaita2: [/* your data */],
    ataskaita3: [/* your data */]
  }
});

if (error) {
  console.error('Upload failed:', error);
} else {
  console.log('Success! Import ID:', data.import_id);
}
```

---

### Step 3: Verify Everything Works

#### 1. Check tables exist
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name LIKE 'gea_daily%'
ORDER BY table_name;
```

Should show:
- `gea_daily_ataskaita1`
- `gea_daily_ataskaita2`
- `gea_daily_ataskaita3`
- `gea_daily_imports`

Should NOT show:
- ~~`gea_daily`~~ (dropped)

#### 2. Check view exists
```sql
SELECT * FROM gea_daily_cows_joined LIMIT 1;
```

Should return data (if you uploaded any).

#### 3. Check RPC works
```sql
SELECT routine_name 
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'gea_daily_upload';
```

Should return: `gea_daily_upload`

#### 4. Check frontend
1. Open app in browser
2. Go to Gyvūnai module
3. Click on an animal that has GEA data
4. Go to "Apžvalga" tab
5. Scroll to "GEA Duomenys" card

**You should see:**
- Blue gradient header "GEA Duomenys"
- 3 tabs: "1-oji Ataskaita", "2-oji Ataskaita", "3-oji Ataskaita"
- Rich organized data display

**You should NOT see:**
- ~~Purple header "GEA Duomenys (Legacy)"~~

#### 5. Check browser console
Open Developer Tools (F12) and look for:
```
🔍 Animal data: {animalId: "...", tag_no: "LT825"}
🔍 Querying gea_daily_cows_joined for cow_number: LT825
🔍 Query result: {newGeaData: {...}, newGeaError: null}
✅ New GEA data found: {cow_number: "LT825", ...}
```

---

## 🔄 Data Migration (Optional)

If you want to migrate existing data from old `gea_daily` to new system:

### Before dropping old table, export data:

```sql
-- Export old data to JSON
COPY (
  SELECT json_agg(row_to_json(t))
  FROM gea_daily t
) TO '/tmp/old_gea_data.json';
```

### Transform and import to new system:

You'll need to write a script to:
1. Read old data
2. Transform to new format (3 separate ataskaita objects per cow)
3. Call `gea_daily_upload()` for each import batch

**Note:** This is complex and depends on your specific data structure. Contact me if you need help with this.

---

## 🚨 Troubleshooting

### "Table gea_daily does not exist"

**Good!** This means migration step 4 worked. The old table is gone.

**Fix:** Upload data using `gea_daily_upload()` RPC.

### "Function gea_daily_upload does not exist"

**Problem:** Migration step 3 didn't run or failed.

**Fix:** Run `20260204000002_create_gea_daily_upload_rpc.sql` again.

### "View gea_daily_cows_joined does not exist"

**Problem:** Migration step 1 didn't run or failed.

**Fix:** Run `20260204000000_create_gea_daily_import_system.sql` again.

### "I don't see the 3-tab interface"

**Check:**
1. Do you have data uploaded?
   ```sql
   SELECT COUNT(*) FROM gea_daily_cows_joined;
   ```
2. Does the cow_number match the animal's tag_no?
   ```sql
   SELECT a.tag_no, g.cow_number
   FROM animals a
   LEFT JOIN gea_daily_cows_joined g ON a.tag_no = g.cow_number
   WHERE a.id = 'YOUR_ANIMAL_ID';
   ```
3. Check browser console for errors

### "Upload fails with validation error"

**Problem:** Data format doesn't match expected structure.

**Fix:** Make sure your payload has:
- `meta.counts` object with counts for each ataskaita
- `meta.markers` object with i1, i2, i3
- All three ataskaita arrays with matching cow_number values

---

## 📊 New Data Structure

### gea_daily_imports
```
id              uuid (PK)
created_at      timestamp
counts          jsonb
markers         jsonb
```

### gea_daily_ataskaita1 (Pregnancy/Lactation)
```
id                              bigserial (PK)
import_id                       uuid (FK)
cow_number                      text
ear_number                      text
cow_state                       text
group_number                    text
pregnant_since                  date
lactation_days                  integer
inseminated_at                  date
pregnant_days                   integer
next_pregnancy_date             date
days_until_waiting_pregnancy    integer
```

### gea_daily_ataskaita2 (Milking)
```
id                      bigserial (PK)
import_id               uuid (FK)
cow_number              text
genetic_worth           text
blood_line              text
avg_milk_prod_weight    numeric
produce_milk            boolean
last_milking_date       date
last_milking_time       time
last_milking_weight     numeric
milkings                jsonb (array of {idx, date, time, weight})
```

### gea_daily_ataskaita3 (Teat/Breeding)
```
id                          bigserial (PK)
import_id                   uuid (FK)
cow_number                  text
teat_missing_right_back     boolean
teat_missing_back_left      boolean
teat_missing_front_left     boolean
teat_missing_front_right    boolean
insemination_count          integer
bull_1                      text
bull_2                      text
bull_3                      text
lactation_number            integer
```

### gea_daily_cows_joined (View)
Joins all three ataskaita tables on import_id + cow_number.

---

## 🎉 Benefits

### For Users
- ✅ Better organized data (3 clear sections)
- ✅ More visible information (all milkings, not just 5)
- ✅ Visual teat status grid
- ✅ Complete breeding history
- ✅ Modern tabbed interface

### For Developers
- ✅ Cleaner data structure
- ✅ Easier to extend (just add columns to specific ataskaita)
- ✅ Better data validation (safe cast functions)
- ✅ Atomic imports (all or nothing)
- ✅ Import history tracking

### For System
- ✅ No more numeric casting errors
- ✅ Handles "******" placeholders gracefully
- ✅ JSONB for flexible milking data
- ✅ Proper foreign key relationships
- ✅ Realtime updates via subscriptions

---

## 📞 Support

If you encounter issues:

1. Check browser console for detailed error messages
2. Run `check-gea-data.sql` to verify database state
3. Review migration files for any errors
4. Check Supabase logs for RPC function errors

---

## 🗂️ File Reference

**Migrations:**
- `supabase/migrations/20260204000000_create_gea_daily_import_system.sql`
- `supabase/migrations/20260204000001_create_gea_daily_safe_cast_functions.sql`
- `supabase/migrations/20260204000002_create_gea_daily_upload_rpc.sql`
- `supabase/migrations/20260204000003_drop_old_gea_daily_table.sql`

**Frontend:**
- `src/components/AnimalDetailSidebar.tsx` (updated to use new system)

**Documentation:**
- `GEA_DAILY_INTEGRATION.md` (technical details)
- `GEA_NEW_INTERFACE_GUIDE.md` (user guide)
- `MIGRATION_TO_NEW_GEA_SYSTEM.md` (this file)

**Testing:**
- `test-gea-upload.js` (sample upload script)
- `check-gea-data.sql` (verification queries)
