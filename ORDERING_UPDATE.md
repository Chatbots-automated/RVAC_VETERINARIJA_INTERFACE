# Ordering Update: Newest Treatments First

## Change Applied

Updated the treated animals report to show **newest treatments first** (descending order by date).

## What Changed

### 1. Database View Ordering
**File**: `supabase/migrations/20260211000000_treated_animals_multiple_rows_per_medicine.sql`

**Before:**
```sql
ORDER BY registration_date ASC, created_at ASC, medicine_name ASC;
```

**After:**
```sql
ORDER BY registration_date DESC, created_at DESC, medicine_name ASC;
```

- `registration_date DESC` - Newest date first
- `created_at DESC` - Within same date, newest treatment first
- `medicine_name ASC` - Medicines alphabetically within same treatment

### 2. Frontend Sorting
**File**: `src/components/Reports.tsx`

**Before:**
```typescript
result.sort((a, b) => {
  const dateCompare = a.registration_date.localeCompare(b.registration_date); // ASC
  if (dateCompare !== 0) return dateCompare;
  return a.created_at.localeCompare(b.created_at); // ASC
});
```

**After:**
```typescript
result.sort((a, b) => {
  const dateCompare = b.registration_date.localeCompare(a.registration_date); // DESC
  if (dateCompare !== 0) return dateCompare;
  return b.created_at.localeCompare(a.created_at); // DESC
});
```

### 3. Eil. Nr. Calculation Logic
**File**: `src/components/ReportTemplates.tsx`

**Updated Logic:**
- Data is sorted DESC (newest first)
- But Eil. Nr. is still sequential from oldest to newest
- Oldest treatment = Eil. Nr. 1
- Newest treatment = Highest Eil. Nr.

**How it works:**
```typescript
// Count unique treatments that are OLDER than this one
const treatmentsOlderThanThis = new Set<string>();

for (let i = 0; i < data.length; i++) {
  const currentRow = data[i];
  
  // If current row has an earlier date, it's older
  if (currentRow.registration_date < row.registration_date) {
    treatmentsOlderThanThis.add(currentRow.treatment_id);
  } 
  // If same date, use created_at
  else if (currentRow.registration_date === row.registration_date) {
    if (currentRow.created_at < row.created_at) {
      treatmentsOlderThanThis.add(currentRow.treatment_id);
    }
  }
}

// Eil. Nr. = number of older treatments + 1
eil_nr: treatmentsOlderThanThis.size + 1
```

## Example Output

### February 2026 Report

| Eil. Nr. | Reg. Data | Gyvūnas | Diagnozė | Gydymas |
|:--------:|-----------|---------|----------|---------|
| **10** | 2026-02-10 | 08945411 | Mastitas | Ketoprocen |
| **9** | 2026-02-09 | 08945412 | Mastitas | Mastijet Forte |
| **8** | 2026-02-08 | 08945413 | Endometritas | Engemycin |
| **7** | 2026-02-07 | 08945411 | Mastitas | Ketoprocen |
| ... | ... | ... | ... | ... |
| **2** | 2026-02-02 | 08945412 | Mastitas | Vitalene C |
| **1** | 2026-02-01 | 08945411 | Mastitas | Mastijet Forte |

**Key Points:**
- ✅ Newest treatment (Feb 10) appears **at the top**
- ✅ Oldest treatment (Feb 1) appears **at the bottom**
- ✅ Eil. Nr. still sequential: oldest = 1, newest = 10
- ✅ Easy to see today's treatments immediately

## Benefits

### 1. **Better UX**
- Most recent treatments visible immediately
- No need to scroll to bottom to see today's work
- Matches natural workflow (recent work is most relevant)

### 2. **Consistent Numbering**
- Eil. Nr. still follows official format
- Oldest treatment = #1
- Sequential numbering maintained
- Complies with Lithuanian veterinary regulations

### 3. **Logical Display**
- Newest first = most relevant information first
- Historical data still accessible by scrolling down
- Date filters still work correctly

## Testing

### Test Case 1: View Current Month
1. Go to **Ataskaitos** → **Gydomų gyvūnų registras**
2. **Expected**: 
   - Today's treatments at the top
   - Oldest treatments at the bottom
   - Eil. Nr. increases as you scroll down

### Test Case 2: Check Eil. Nr. Sequence
1. Look at the report
2. **Expected**:
   - Oldest date has lowest Eil. Nr. (e.g., Feb 1 = #1)
   - Newest date has highest Eil. Nr. (e.g., Feb 10 = #10)
   - Sequential numbering (no gaps)

### Test Case 3: Multiple Treatments Same Day
1. Find a day with multiple treatments
2. **Expected**:
   - All treatments from that day grouped together
   - Ordered by creation time (newest first within that day)
   - Eil. Nr. still sequential based on creation time

### Test Case 4: Multiple Medicines Same Treatment
1. Find a treatment with multiple medicines
2. **Expected**:
   - All medicines have same Eil. Nr.
   - Medicines listed alphabetically
   - Treatment appears as one group

## Migration Instructions

### Apply SQL Migration
```bash
# Via Supabase Dashboard SQL Editor
# Execute: supabase/migrations/20260211000000_treated_animals_multiple_rows_per_medicine.sql
```

### Verify
```sql
SELECT 
  registration_date,
  created_at,
  animal_tag,
  medicine_name
FROM vw_treated_animals_detailed
ORDER BY registration_date DESC, created_at DESC
LIMIT 10;
```

**Expected**: Newest dates at top

## Summary

✅ **Newest treatments first** - Today's work at the top  
✅ **Eil. Nr. still sequential** - Oldest = 1, Newest = highest  
✅ **Better UX** - Most relevant info immediately visible  
✅ **Compliant** - Still follows official format  

The report now shows treatments in reverse chronological order (newest first) while maintaining proper sequential numbering for Eil. Nr.! 🎉
