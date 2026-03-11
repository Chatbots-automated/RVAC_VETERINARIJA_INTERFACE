# GEA New Interface - User Guide

## What Changed?

The GEA data display in the Animal Detail Sidebar now has **TWO MODES**:

### 🆕 **NEW MODE** (3-Tab Interface)
Shows when you have data from the new `gea_daily_upload` RPC

### 📦 **LEGACY MODE** (Simple View)
Shows when you only have data from the old `gea_daily` table

---

## How to See the New Interface

### Step 1: Upload GEA Data via RPC

You need to upload data using the new `gea_daily_upload` RPC function. The data must include:

```javascript
const payload = {
  meta: {
    counts: { ataskaita1: X, ataskaita2: Y, ataskaita3: Z },
    markers: { i1: 1, i2: 2, i3: 3 }
  },
  ataskaita1: [ /* pregnancy/lactation data */ ],
  ataskaita2: [ /* milking data */ ],
  ataskaita3: [ /* teat/breeding data */ ]
};

await supabase.rpc('gea_daily_upload', { payload });
```

### Step 2: Open Animal Detail Sidebar

1. Go to Animals module
2. Click on an animal that has data in the new system
3. Go to "Apžvalga" tab
4. Scroll down to "GEA Duomenys" card

### Step 3: You'll See

**If NEW data exists:**
- Blue gradient header "GEA Duomenys"
- 3 clickable tabs at the top
- Rich organized data display

**If only OLD data exists:**
- Purple gradient header "GEA Duomenys (Legacy)"
- Simple single-view display
- Same as before

---

## The 3-Tab Interface Explained

### 📋 **Tab 1: 1-oji Ataskaita (Veršingumas)**

**What it shows:**
- Ausies Nr. (Ear number)
- Statusas (Status) - APSĖK highlighted in green
- Grupė (Group)
- Laktacijos dienos (Lactation days)
- Apsėklinimo data (Insemination date)
- Veršinga nuo (Pregnant since)
- Veršingumo dienos (Pregnancy days)
- Kita veršingumo data (Next pregnancy date)
- Dienų iki laukiamo veršingumo (Days until expected pregnancy)

**Data source:** `gea_daily_ataskaita1` table

---

### 🥛 **Tab 2: 2-oji Ataskaita (Melžimas)**

**What it shows:**
- Genetinė vertė (Genetic worth) - e.g., "VG-85"
- Kraujo linija (Blood line) - e.g., "Holstein"
- Vidutinis pieno kiekis (Average milk weight)
- Gamina pieną (Produces milk) - Taip/Ne
- Paskutinis melžimas (Last milking date/time)
- Paskutinio melžimo kiekis (Last milking weight)

**PLUS: Scrollable list of ALL milkings!**
- Shows up to 9 milkings
- Each displays: #index, date, time, weight (kg)
- Purple badges for visual clarity
- Auto-scrolls if more than 6 milkings

**Data source:** `gea_daily_ataskaita2` table

---

### 🎯 **Tab 3: 3-oji Ataskaita (Speniai/Veisimas)**

**What it shows:**

**Spenių Būklė (Teat Status)** - Visual 4-quadrant grid:
```
┌─────────────┬─────────────┐
│ Priekinis   │ Priekinis   │
│ kairysis    │ dešinysis   │
│ 🟢 OK       │ 🟢 OK       │
└─────────────┴─────────────┘
┌─────────────┬─────────────┐
│ Galinis     │ Galinis     │
│ kairysis    │ dešinysis   │
│ 🔴 Trūksta  │ 🟢 OK       │
└─────────────┴─────────────┘
```
- Green = OK
- Red = Missing (Trūksta)

**Veisimo Informacija (Breeding Info):**
- Apsėklinimų skaičius (Insemination count)
- Laktacijos numeris (Lactation number)
- Bulius #1, #2, #3 (Bulls used for breeding)

**Data source:** `gea_daily_ataskaita3` table

---

## Why You Might See "Legacy" View

**Reasons:**
1. ❌ No data uploaded via new RPC yet
2. ❌ Animal's `tag_no` doesn't match `cow_number` in new tables
3. ❌ Migration files not applied to database yet
4. ❌ RPC function not created yet

**To fix:**
1. Apply the 3 migration files in Supabase Dashboard
2. Upload GEA data via `gea_daily_upload` RPC
3. Make sure cow_number matches animal's tag_no

---

## Testing the New Interface

### Option 1: Use Test Script

Run the provided test script:
```bash
node test-gea-upload.js
```

This uploads sample data for cows LT825 and LT826.

### Option 2: Manual Upload

In Supabase SQL Editor:
```sql
SELECT gea_daily_upload('{
  "meta": {"counts": {"ataskaita1": 1, "ataskaita2": 1, "ataskaita3": 1}},
  "ataskaita1": [{"cow_number": "LT825", "cow_state": "APSĖK", ...}],
  "ataskaita2": [{"cow_number": "LT825", "avg_milk_prod_weight": "28.5", ...}],
  "ataskaita3": [{"cow_number": "LT825", "insemination_count": 2, ...}]
}'::jsonb);
```

### Option 3: Check Console Logs

Open browser console when viewing animal detail:
- ✅ "New GEA data found" → 3-tab interface should show
- ⚠️ "No new GEA data, trying old" → Legacy view will show

---

## Data Flow Diagram

```
GEA System Export
       ↓
  Parse Excel/CSV
       ↓
  Create JSON payload
       ↓
  Call gea_daily_upload(payload)
       ↓
  Data saved to 3 tables:
  - gea_daily_ataskaita1
  - gea_daily_ataskaita2  
  - gea_daily_ataskaita3
       ↓
  gea_daily_cows_joined view
       ↓
  AnimalDetailSidebar queries by cow_number
       ↓
  If found → 3-Tab Interface
  If not → Legacy View
```

---

## Troubleshooting

### "I only see Legacy view"

**Check:**
1. Are migration files applied?
   ```sql
   SELECT * FROM gea_daily_imports ORDER BY created_at DESC LIMIT 1;
   ```
   If error → Migrations not applied

2. Is there data for this cow?
   ```sql
   SELECT * FROM gea_daily_cows_joined WHERE cow_number = 'LT825';
   ```
   If empty → No data uploaded yet

3. Does cow_number match tag_no?
   ```sql
   SELECT id, tag_no FROM animals WHERE tag_no = 'LT825';
   ```
   Must match exactly

### "RPC function not found"

Apply migration file:
```sql
-- Run in Supabase SQL Editor
-- File: 20260204000002_create_gea_daily_upload_rpc.sql
```

### "Upload works but data doesn't show"

Check console logs in browser:
- Should see: "✅ New GEA data found: {data}"
- If you see: "⚠️ No new GEA data" → cow_number mismatch

---

## Benefits of New System

### 🎯 **Organized Data**
- 3 clear sections instead of mixed fields
- Easy to find specific information
- Tab navigation for better UX

### 📊 **More Data Visible**
- ALL milkings (not just 5)
- Teat status visual grid
- Complete breeding history (3 bulls)
- Genetic worth & blood line

### 🔒 **Data Safety**
- Handles "******" placeholders
- No numeric casting errors
- Raw data preserved

### 🔄 **Backwards Compatible**
- Old data still works
- Smooth transition
- No breaking changes

---

## Next Steps

1. **Apply Migrations** (if not done yet)
   - Run all 3 SQL files in Supabase Dashboard
   - Order matters: 000, 001, 002

2. **Upload GEA Data**
   - Use your existing GEA parser
   - Call `gea_daily_upload` RPC
   - Verify import_id returned

3. **Test Interface**
   - Open animal detail for uploaded cow
   - Should see 3-tab interface
   - Click through tabs to verify

4. **Monitor Console**
   - Check for "✅ New GEA data found" message
   - Verify no errors

---

## File Locations

**Migrations:**
- `supabase/migrations/20260204000000_create_gea_daily_import_system.sql`
- `supabase/migrations/20260204000001_create_gea_daily_safe_cast_functions.sql`
- `supabase/migrations/20260204000002_create_gea_daily_upload_rpc.sql`

**Frontend:**
- `src/components/AnimalDetailSidebar.tsx` (updated)

**Test:**
- `test-gea-upload.js` (sample upload script)

**Docs:**
- `GEA_DAILY_INTEGRATION.md` (technical details)
- `GEA_NEW_INTERFACE_GUIDE.md` (this file)
