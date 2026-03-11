# Breed Column Update - Column 4

## Change Applied

Updated the 4th column "Gyvūno rūšis, lytis" to show **breed** instead of species (e.g., "Holstein" instead of "Galvijai").

## What Changed

### Database View
**File**: `supabase/migrations/20260211000000_treated_animals_multiple_rows_per_medicine.sql`

**Before:**
```sql
-- Column 4: Gyvūno rūšis, lytis (Animal species, sex)
a.species,
a.sex,
```

**After:**
```sql
-- Column 4: Gyvūno rūšis, lytis (Animal breed, sex)
COALESCE(NULLIF(TRIM(a.breed), ''), a.species) AS species,
a.sex,
```

### Logic
- **Primary**: Use `breed` column if it has a value
- **Fallback**: Use `species` if breed is empty/null
- **Trim**: Remove any whitespace from breed

## Examples

### With Breed
```
Animal has breed = "Holstein"
→ Display: "Holstein"
```

### Without Breed
```
Animal has breed = NULL or ""
→ Display: "Galvijai" (species)
```

### Common Breeds
- Holstein
- Jersey
- Simmental
- Lithuanian Red
- Lithuanian Black and White
- etc.

## Benefits

✅ **More specific** - Shows actual breed instead of generic "Galvijai"  
✅ **Better tracking** - Easier to identify specific animals  
✅ **Backward compatible** - Falls back to species if breed not set  
✅ **Cleaner data** - Trims whitespace automatically  

## Migration Instructions

### Apply SQL Migration
```bash
# Via Supabase Dashboard SQL Editor
# Execute: supabase/migrations/20260211000000_treated_animals_multiple_rows_per_medicine.sql
```

### Verify
```sql
SELECT 
  animal_tag,
  species,  -- This now shows breed if available
  sex
FROM vw_treated_animals_detailed
LIMIT 10;
```

**Expected**: Shows breed names like "Holstein", "Jersey", etc.

## Testing

### Test Case 1: Animal with Breed
1. Go to **Ataskaitos** → **Gydomų gyvūnų registras**
2. Find an animal with breed set (e.g., Holstein)
3. **Expected**: Column 4 shows "Holstein" (not "Galvijai")

### Test Case 2: Animal without Breed
1. Find an animal without breed set
2. **Expected**: Column 4 shows "Galvijai" (species fallback)

### Test Case 3: Multiple Animals
1. View report with multiple animals
2. **Expected**: Each shows their specific breed or species

## Summary

The 4th column now shows:
- ✅ **Breed** if available (e.g., "Holstein", "Jersey")
- ✅ **Species** as fallback (e.g., "Galvijai")
- ✅ More specific animal identification
- ✅ Better data quality

This provides more detailed information about each animal in the report! 🐄
