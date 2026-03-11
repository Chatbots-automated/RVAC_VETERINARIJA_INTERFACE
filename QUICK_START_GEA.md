# Quick Start - New GEA System

## ✅ What's Done

1. ✅ Old `gea_daily` table dropped
2. ✅ New GEA system tables created
3. ✅ Upload RPC function ready
4. ✅ Frontend updated to show 3-tab interface
5. ✅ Fixed `setDisabledTeats` error

## 🚀 Next Steps (Do This Now!)

### Step 1: Upload Test Data

Run this in **Supabase SQL Editor**:

```sql
-- File: upload-test-gea-data.sql
-- This uploads data for animal LT000008564340 (the one you were viewing)
```

Copy and paste the contents of `upload-test-gea-data.sql` into Supabase SQL Editor and run it.

### Step 2: View the New Interface

1. Refresh your browser (Ctrl+R or Cmd+R)
2. Go to **Gyvūnai** module
3. Click on animal **LT000008564340**
4. Go to **Apžvalga** tab
5. Scroll down to **GEA Duomenys** card

**You should see:**
- 🔵 Blue gradient header "GEA Duomenys"
- 📋 3 tabs at the top
- 🎨 Beautiful organized data display

### Step 3: Test APSĖK (Pregnant) Cow

1. First, find another animal's tag_no:
   ```sql
   SELECT id, tag_no, name FROM animals WHERE tag_no IS NOT NULL LIMIT 5;
   ```

2. Edit `upload-apsek-test-data.sql` and replace `LT000008564341` with one of the tag_no values you found

3. Run the modified SQL in Supabase

4. View that animal in the app - you'll see:
   - 🟢 Green "APSĖKLINTAS" badge
   - 🟢 Green banner warning about synchronization protocols
   - 📊 All pregnancy data filled in

---

## 🎯 What Each Tab Shows

### Tab 1: 1-oji Ataskaita (Veršingumas)
- Ausies Nr. (Ear number)
- **Statusas** (MELŽ / APSĖK) - highlighted if pregnant
- Grupė (Group)
- Laktacijos dienos (Lactation days)
- Apsėklinimo data (Insemination date)
- Veršinga nuo (Pregnant since)
- Veršingumo dienos (Pregnancy days)
- Kita veršingumo data (Next pregnancy date)
- Dienų iki laukiamo veršingumo

### Tab 2: 2-oji Ataskaita (Melžimas)
- Genetinė vertė (e.g., VG-84)
- Kraujo linija (e.g., Holstein)
- Vidutinis pieno kiekis (Average milk weight)
- Gamina pieną (Produces milk)
- Paskutinis melžimas (Last milking)
- **Visi melžimai** - scrollable list showing ALL milkings with:
  - Index number
  - Date & time
  - Weight in kg

### Tab 3: 3-oji Ataskaita (Speniai/Veisimas)
- **Spenių Būklė** - Visual 4-quadrant grid:
  - 🟢 Green = OK
  - 🔴 Red = Trūksta (Missing)
- **Veisimo Informacija:**
  - Apsėklinimų skaičius
  - Laktacijos numeris
  - Bulius #1, #2, #3

---

## 🔍 Debugging

### Check Browser Console

After uploading data, open the animal detail and check console:

**Expected (Success):**
```
🔍 Animal data: {animalId: "...", tag_no: "LT000008564340"}
🔍 Querying gea_daily_cows_joined for cow_number: LT000008564340
🔍 Query result: {newGeaData: {...}, newGeaError: null}
✅ New GEA data found: {cow_number: "LT000008564340", ...}
```

**If No Data:**
```
🔍 Query result: {newGeaData: null, newGeaError: null}
⚠️ No new GEA data, trying old gea_daily table
⚠️ Old gea_daily table not found or error: Could not find the table...
```
→ This means you need to upload data for that cow

### Verify Upload Worked

```sql
-- Check if data exists
SELECT COUNT(*) FROM gea_daily_cows_joined;

-- Check specific cow
SELECT * FROM gea_daily_cows_joined WHERE cow_number = 'LT000008564340';

-- Check latest import
SELECT * FROM gea_daily_imports ORDER BY created_at DESC LIMIT 1;
```

---

## 📁 Files Reference

**SQL Scripts (Ready to Run):**
- `upload-test-gea-data.sql` - Upload data for LT000008564340
- `upload-apsek-test-data.sql` - Upload data for pregnant cow
- `check-gea-data.sql` - Verify database state

**Migrations (Already Applied):**
- `20260204000000_create_gea_daily_import_system.sql`
- `20260204000001_create_gea_daily_safe_cast_functions.sql`
- `20260204000002_create_gea_daily_upload_rpc.sql`
- `20260204000003_drop_old_gea_daily_table.sql`

**Documentation:**
- `QUICK_START_GEA.md` (this file) - Quick start guide
- `MIGRATION_TO_NEW_GEA_SYSTEM.md` - Complete migration guide
- `GEA_NEW_INTERFACE_GUIDE.md` - User guide
- `GEA_DAILY_INTEGRATION.md` - Technical documentation

---

## 🎨 Visual Preview

### MELŽ (Milking) Cow
```
┌─────────────────────────────────────────┐
│ 🔵 GEA Duomenys                         │
│ Importuota: 2026-02-04 09:45           │
├─────────────────────────────────────────┤
│ [1-oji Ataskaita] 2-oji Ataskaita  3-oji│
├─────────────────────────────────────────┤
│ Ausies Nr: 8564340                      │
│ Statusas: MELŽ                          │
│ Grupė: 1                                │
│ Laktacijos dienos: 145                  │
│ ...                                     │
└─────────────────────────────────────────┘
```

### APSĖK (Pregnant) Cow
```
┌─────────────────────────────────────────┐
│ 🔵 GEA Duomenys          [✅ APSĖKLINTAS]│
│ Importuota: 2026-02-04 09:45           │
├─────────────────────────────────────────┤
│ 🟢 Gyvūnas apsėklintas                  │
│    Visi aktyvūs protokolai atšaukiami   │
├─────────────────────────────────────────┤
│ [1-oji Ataskaita] 2-oji Ataskaita  3-oji│
├─────────────────────────────────────────┤
│ Ausies Nr: 8564341                      │
│ Statusas: APSĖK (highlighted green)     │
│ Grupė: 2                                │
│ Veršinga nuo: 2025-12-10                │
│ Veršingumo dienos: 56 d.                │
│ ...                                     │
└─────────────────────────────────────────┘
```

---

## 💡 Tips

1. **cow_number MUST match tag_no** - Make sure the cow_number in your upload matches the animal's tag_no exactly

2. **Use actual dates** - The example uses recent dates, adjust them to match your data

3. **Milkings are flexible** - You can have 1-9 milkings (or more), stored as JSONB array

4. **"******" is handled** - The safe cast functions automatically convert "******" to NULL

5. **Realtime updates** - When you upload new data, open sidebars will automatically refresh

---

## ✨ Ready to Go!

Just run `upload-test-gea-data.sql` in Supabase and refresh your browser. The new interface should appear immediately! 🎉
