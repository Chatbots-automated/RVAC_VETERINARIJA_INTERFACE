# GYDOMŲ GYVŪNŲ REGISTRACIJOS ŽURNALAS - Implementation Guide

## Overview

Implemented **Option 1**: Multiple rows per medicine for the **GYDOMŲ GYVŪNŲ REGISTRACIJOS ŽURNALAS** (Treated Animals Registration Journal).

### Key Features
- ✅ **One row per medicine** (not per treatment)
- ✅ **Sequential Eil. Nr.** based on registration date
- ✅ **Temperature display** in "Atlikti tyrimai" column
- ✅ **Withdrawal dates only** (no p-X;m-Y format)

---

## Implementation Details

### 1. Database View (`vw_treated_animals_detailed`)

**File**: `supabase/migrations/20260211000000_treated_animals_multiple_rows_per_medicine.sql`

#### Structure
```sql
-- UNION of two queries:
-- 1. usage_items (immediate treatments)
-- 2. treatment_courses (multi-day owner-administered)
```

#### Key Columns
- `medicine_name`: Name of the medicine
- `medicine_dose`: Dose amount
- `medicine_unit`: Unit (ml, vnt, etc.)
- `medicine_days`: Number of days (for courses)
- `withdrawal_until_meat`: Meat withdrawal date
- `withdrawal_until_milk`: Milk withdrawal date
- `withdrawal_days_meat`: Days count (for filtering)
- `withdrawal_days_milk`: Days count (for filtering)

#### Temperature Logic
```sql
CASE 
    WHEN t.animal_condition ~ '^[0-9]+\.?[0-9]*$' 
    THEN CONCAT('Temperatūra: ', t.animal_condition, '°C')
    ELSE COALESCE(NULLIF(TRIM(t.tests), ''), 'Temperatūra')
END AS tests
```
- If `animal_condition` is numeric → "Temperatūra: 39.5°C"
- Otherwise → Use `tests` field or default "Temperatūra"

---

## Example Output

### Treatment with 3 Medicines

| Eil. Nr. | Reg. Data | Laikytojas | Ženkl. Nr. | Gyvūnas | Diagnozė | Gydymas | Dozė | Išlauka | Baigtis |
|----------|-----------|------------|------------|---------|----------|---------|------|---------|---------|
| **428** | 2025-10-02 | ŽŪB "Berčiūnai" | 08945411 | Karvė | Mastitas | Mastijet Forte 8g N20 | 2 vnt | 🥩 2025-10-06<br/>🥛 2025-10-16 | - |
| **428** | 2025-10-02 | ŽŪB "Berčiūnai" | 08945411 | Karvė | Mastitas | Ketoprocen 100 mg/ml | 20 ml | 🥛 2025-10-06 | - |
| **428** | 2025-10-02 | ŽŪB "Berčiūnai" | 08945411 | Karvė | Mastitas | Vitalene C inj.100ml | 15 ml | - | Pasveiko |

**Note**: Same Eil. Nr. (428) for all medicines in the same treatment.

---

## Eil. Nr. Logic

### How It Works
1. **Groups by treatment_id**: All medicines in same treatment get same Eil. Nr.
2. **Sequential by date**: Numbers increment based on registration date
3. **Resets on filter**: When you filter by date range, numbering starts from 1

### Example Timeline
```
2025-10-02:
  - Treatment A (3 medicines) → Eil. Nr. 428, 428, 428
  - Treatment B (2 medicines) → Eil. Nr. 429, 429

2025-10-03:
  - Treatment C (3 medicines) → Eil. Nr. 430, 430, 430

2025-10-09:
  - Treatment D (1 medicine) → Eil. Nr. 431
```

### Code Implementation
```typescript
// Frontend calculation (ReportTemplates.tsx)
const dataWithEilNr = data.map((row, idx) => {
  // Count unique treatments before this one
  const treatmentsBeforeThisOne = new Set<string>();
  
  for (let i = 0; i < idx; i++) {
    const currentRow = data[i];
    if (currentRow.registration_date < row.registration_date) {
      treatmentsBeforeThisOne.add(currentRow.treatment_id);
    } else if (currentRow.registration_date === row.registration_date && 
               currentRow.treatment_id !== row.treatment_id) {
      // Check which treatment appeared first
      const firstOccurrenceOfCurrent = data.findIndex(r => r.treatment_id === currentRow.treatment_id);
      const firstOccurrenceOfRow = data.findIndex(r => r.treatment_id === row.treatment_id);
      if (firstOccurrenceOfCurrent < firstOccurrenceOfRow) {
        treatmentsBeforeThisOne.add(currentRow.treatment_id);
      }
    }
  }
  
  return {
    ...row,
    eil_nr: treatmentsBeforeThisOne.size + 1
  };
});
```

---

## Column Details

### Column 9: Atlikti Tyrimai (Tests Performed)

**Display Logic**:
- If `animal_condition` contains a number → **"Temperatūra: 39.5°C"**
- Otherwise → Show `tests` field or default **"Temperatūra"**

**Examples**:
```
animal_condition = "39.5" → "Temperatūra: 39.5°C"
animal_condition = "38.8" → "Temperatūra: 38.8°C"
animal_condition = "Patenkinama" → "Temperatūra"
animal_condition = NULL → "Temperatūra"
```

### Column 11: Gydymas (Treatment/Medicine)

**Display**:
```
Medicine Name
Dozė: X unit [× Y d.]
```

**Examples**:
- Immediate: `Mastijet Forte 8g N20` + `Dozė: 2 vnt`
- Course: `Engemycin 10% 250ml` + `Dozė: 50 ml × 5 d.`

### Column 12: Išlauka (Withdrawal Period)

**Display**: Only dates with icons
- 🥩 Meat withdrawal date
- 🥛 Milk withdrawal date

**Examples**:
```
🥩 2025-10-06
🥛 2025-10-16

🥛 2025-10-06

-  (no withdrawal)
```

**NOT shown**: `p-4;m-14` format

---

## Migration Instructions

### 1. Apply SQL Migration

**Via Supabase Dashboard**:
1. Go to SQL Editor
2. Copy contents of `supabase/migrations/20260211000000_treated_animals_multiple_rows_per_medicine.sql`
3. Execute

**Via Supabase CLI**:
```bash
supabase db push
```

### 2. Verify View

```sql
-- Test query
SELECT 
  registration_date,
  animal_tag,
  disease_name,
  medicine_name,
  medicine_dose,
  medicine_unit,
  withdrawal_until_meat,
  withdrawal_until_milk
FROM vw_treated_animals_detailed
WHERE registration_date >= '2025-10-01'
ORDER BY registration_date ASC, treatment_id, medicine_name
LIMIT 20;
```

### 3. Test Frontend

1. Navigate to **Ataskaitos** → **Gydomų gyvūnų registras**
2. Set date filter: October 2025
3. Click **"Generuoti ataskaitą"**

**Verify**:
- ✅ Multiple rows per treatment (one per medicine)
- ✅ Same Eil. Nr. for all medicines in same treatment
- ✅ Temperature shows in "Atlikti tyrimai" column
- ✅ Withdrawal shows only dates (no p-X;m-Y)

---

## Comparison: Before vs After

### Before (Option 2 - Single Row)
```
Eil. Nr.: 428
Gydymas: 
  💊 Mastijet Forte 8g N20 (dozė: 2 vnt, išlauka: p-4;m-14)
  💊 Ketoprocen 100 mg/ml (dozė: 20 ml, išlauka: p-0;m-4)
  💊 Vitalene C inj.100ml (dozė: 15 ml, išlauka: p-0;m-0)
```
*One row per treatment*

### After (Option 1 - Multiple Rows)
```
Eil. Nr.: 428 | Gydymas: Mastijet Forte 8g N20 | Dozė: 2 vnt | Išlauka: 🥩 2025-10-06, 🥛 2025-10-16
Eil. Nr.: 428 | Gydymas: Ketoprocen 100 mg/ml | Dozė: 20 ml | Išlauka: 🥛 2025-10-06
Eil. Nr.: 428 | Gydymas: Vitalene C inj.100ml | Dozė: 15 ml | Išlauka: -
```
*Multiple rows per treatment (one per medicine)*

---

## Benefits

### ✅ Regulatory Compliance
- Matches client's existing format
- Each medicine clearly documented
- Individual withdrawal periods per medicine

### ✅ Better Clarity
- Easy to see each medicine's details
- Clear dose information per medicine
- Specific withdrawal dates per medicine

### ✅ Accurate Tracking
- No confusion about which medicine has which withdrawal
- Multi-day courses clearly marked
- Temperature readings properly displayed

---

## Files Modified

### Created
1. `supabase/migrations/20260211000000_treated_animals_multiple_rows_per_medicine.sql`
2. `TREATED_ANIMALS_IMPLEMENTATION.md` (this file)

### Modified
1. `src/components/ReportTemplates.tsx`
   - Updated Eil. Nr. calculation for multiple rows
   - Changed medicine display to show individual medicine
   - Updated withdrawal display (dates only)
2. `src/components/Reports.tsx`
   - Added proper ordering (already done)

---

## Technical Notes

### Data Source Priority
1. **usage_items**: Immediate treatments during visit
2. **treatment_courses**: Owner-administered multi-day courses

### Withdrawal Calculation
```sql
-- Meat withdrawal
(t.reg_date + (p.withdrawal_days_meat || ' days')::interval)::date

-- Milk withdrawal
(t.reg_date + (p.withdrawal_days_milk || ' days')::interval)::date
```

### Temperature Detection
Uses regex to check if `animal_condition` is numeric:
```sql
t.animal_condition ~ '^[0-9]+\.?[0-9]*$'
```
Matches: `39.5`, `38`, `40.2`
Doesn't match: `Patenkinama`, `Bloga`, etc.

---

## Troubleshooting

### Issue: Eil. Nr. not sequential
**Solution**: Ensure data is ordered by `registration_date ASC` in query

### Issue: Same treatment shows different Eil. Nr.
**Solution**: Check that `treatment_id` is consistent across medicines

### Issue: Temperature not showing
**Solution**: Verify `animal_condition` field contains numeric value

### Issue: Withdrawal dates missing
**Solution**: Check that products have `withdrawal_days_meat` and `withdrawal_days_milk` values

---

## Future Enhancements

1. **Visual grouping**: Add subtle background color for same treatment
2. **Collapsible rows**: Option to collapse/expand medicines per treatment
3. **Summary row**: Show total medicines per treatment
4. **Export optimization**: Better Excel formatting for grouped data
