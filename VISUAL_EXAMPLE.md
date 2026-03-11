# GYDOMŲ GYVŪNŲ REGISTRACIJOS ŽURNALAS - Visual Example

## Complete Table Example

### Treatment on 2025-10-02 (Eil. Nr. 428)

| Eil. Nr. | Reg. Data | Laikytojas | Ženkl. Nr. | Gyvūnas | Amžius | Ligos požymiai | Būklė | Atlikti tyrimai | Diagnozė | Gydymas | Išlauka | Baigtis | Veterinaras |
|:--------:|-----------|------------|------------|---------|:------:|----------------|-------|-----------------|----------|---------|---------|---------|-------------|
| **428** | 2025.10.02 | ŽŪB "Berčiūnai" | 08945411 | Karvė | 3 m. | 2025.10.02 | Patenkinama | **Temperatūra: 39.5°C** | Mastitas | **Mastijet Forte 8g N20**<br/>Dozė: 2 vnt | 🥩 2025.10.06<br/>🥛 2025.10.16 | - | Artūras Abromaitis |
| **428** | 2025.10.02 | ŽŪB "Berčiūnai" | 08945411 | Karvė | 3 m. | 2025.10.02 | Patenkinama | **Temperatūra: 39.5°C** | Mastitas | **Ketoprocen 100 mg/ml**<br/>Dozė: 20 ml | 🥛 2025.10.06 | - | Artūras Abromaitis |
| **428** | 2025.10.02 | ŽŪB "Berčiūnai" | 08945411 | Karvė | 3 m. | 2025.10.02 | Patenkinama | **Temperatūra: 39.5°C** | Mastitas | **Vitalene C inj.100ml**<br/>Dozė: 15 ml | - | **Pasveiko** | Artūras Abromaitis |

---

### Treatment on 2025-10-03 (Eil. Nr. 429)

| Eil. Nr. | Reg. Data | Laikytojas | Ženkl. Nr. | Gyvūnas | Amžius | Ligos požymiai | Būklė | Atlikti tyrimai | Diagnozė | Gydymas | Išlauka | Baigtis | Veterinaras |
|:--------:|-----------|------------|------------|---------|:------:|----------------|-------|-----------------|----------|---------|---------|---------|-------------|
| **429** | 2025.10.03 | ŽŪB "Berčiūnai" | 08945411 | Karvė | 1 m. | 2025.10.03 | Patenkinama | **Temperatūra** | Mastitas | **Mastijet Forte 8g N20**<br/>Dozė: 2 vnt | 🥩 2025.10.07<br/>🥛 2025.10.17 | - | Artūras Abromaitis |
| **429** | 2025.10.03 | ŽŪB "Berčiūnai" | 08945411 | Karvė | 1 m. | 2025.10.03 | Patenkinama | **Temperatūra** | Mastitas | **Engemycin 10% 250ml**<br/>Dozė: 50 ml | 🥩 2025.10.07<br/>🥛 2025.10.30 | - | Artūras Abromaitis |
| **429** | 2025.10.03 | ŽŪB "Berčiūnai" | 08945411 | Karvė | 1 m. | 2025.10.03 | Patenkinama | **Temperatūra** | Mastitas | **Ketoprocen 100 mg/ml**<br/>Dozė: 20 ml | 🥛 2025.10.07 | **Pasveiko** | Artūras Abromaitis |

---

### Treatment on 2025-10-09 (Eil. Nr. 430)

| Eil. Nr. | Reg. Data | Laikytojas | Ženkl. Nr. | Gyvūnas | Amžius | Ligos požymiai | Būklė | Atlikti tyrimai | Diagnozė | Gydymas | Išlauka | Baigtis | Veterinaras |
|:--------:|-----------|------------|------------|---------|:------:|----------------|-------|-----------------|----------|---------|---------|---------|-------------|
| **430** | 2025.10.09 | ŽŪB "Berčiūnai" | 08945411 | Karvė | 3 m. | 2025.10.09 | Patenkinama | **Temperatūra: 38.8°C** | Mastitas | **Ketoprocen 100 mg/ml**<br/>Dozė: 15 ml | 🥛 2025.10.13 | **Pasveiko** | Artūras Abromaitis |

---

## Key Points

### 1. Eil. Nr. (Sequential Number)
- ✅ **428**: All 3 medicines from treatment on 2025-10-02
- ✅ **429**: All 3 medicines from treatment on 2025-10-03
- ✅ **430**: Single medicine from treatment on 2025-10-09

### 2. Temperature Display
- ✅ **"Temperatūra: 39.5°C"**: When temperature is recorded
- ✅ **"Temperatūra: 38.8°C"**: When temperature is recorded
- ✅ **"Temperatūra"**: When no temperature recorded

### 3. Medicine Display
- ✅ **Medicine name** on first line
- ✅ **"Dozė: X unit"** on second line
- ✅ One row per medicine

### 4. Withdrawal Period
- ✅ **🥩 2025.10.06**: Meat withdrawal date
- ✅ **🥛 2025.10.16**: Milk withdrawal date
- ✅ **-**: No withdrawal (when both are 0 days)
- ✅ **NO p-X;m-Y format shown**

### 5. Treatment Outcome
- ✅ **"Pasveiko"**: Shown on last medicine row
- ✅ **"-"**: Empty on other medicine rows
- ✅ Only one outcome per treatment

---

## Comparison: Client's Format vs New Format

### Client's Original Data:
```json
[
  {
    "eil_nr": 428,
    "reg_data": "2025.10.02",
    "gyvunas": "Karvė",
    "diagnoze": "Mastitas",
    "gydymas": "Mastijet Forte 8g N20",
    "doze": "2",
    "islauka": "p-4;m-14"
  },
  {
    "eil_nr": 428,
    "reg_data": "2025.10.02",
    "gyvunas": "Karvė",
    "diagnoze": "Mastitas",
    "gydymas": "Ketoprocen 100 mg/ml",
    "doze": "20",
    "islauka": "p-0;m-4"
  }
]
```

### New System Output:
```
Row 1: Eil. Nr. 428 | Gydymas: Mastijet Forte 8g N20 | Dozė: 2 vnt | Išlauka: 🥩 2025.10.06, 🥛 2025.10.16
Row 2: Eil. Nr. 428 | Gydymas: Ketoprocen 100 mg/ml | Dozė: 20 ml | Išlauka: 🥛 2025.10.06
```

### ✅ Perfect Match!
- Same structure (multiple rows per treatment)
- Same Eil. Nr. for all medicines
- Individual medicine details per row
- Withdrawal dates instead of p-X;m-Y format

---

## Filter Examples

### Example 1: Filter by Date Range
**Filter**: 2025-10-01 to 2025-10-31  
**Result**: Eil. Nr. starts at 1 and increments sequentially

### Example 2: Filter by Specific Animal
**Filter**: Animal 08945411  
**Result**: Only shows treatments for that animal, Eil. Nr. sequential

### Example 3: Filter by Disease
**Filter**: Mastitas  
**Result**: Only shows Mastitas treatments, Eil. Nr. sequential

### Example 4: Multiple Months
**Filter**: 2025-10-01 to 2025-11-30  
**Result**: Eil. Nr. continues across months (no reset)

---

## Print/Export View

When printed or exported, the table maintains:
- ✅ All 14 columns
- ✅ Multiple rows per treatment
- ✅ Same Eil. Nr. for grouped medicines
- ✅ Temperature in "Atlikti tyrimai" column
- ✅ Withdrawal dates with icons
- ✅ Clear medicine and dose information

---

## Database Structure

### View: `vw_treated_animals_detailed`

**Returns one row per medicine**:
```sql
SELECT 
  treatment_id,           -- Same for all medicines in treatment
  registration_date,      -- Same for all medicines in treatment
  animal_tag,            -- Same for all medicines in treatment
  disease_name,          -- Same for all medicines in treatment
  medicine_name,         -- DIFFERENT per row
  medicine_dose,         -- DIFFERENT per row
  medicine_unit,         -- DIFFERENT per row
  withdrawal_until_meat, -- DIFFERENT per row
  withdrawal_until_milk  -- DIFFERENT per row
FROM vw_treated_animals_detailed
ORDER BY registration_date, treatment_id, medicine_name;
```

---

## Summary

✅ **Multiple rows per treatment** - One row per medicine  
✅ **Same Eil. Nr.** - All medicines in same treatment share number  
✅ **Temperature shown** - In "Atlikti tyrimai" column  
✅ **Dates only** - No p-X;m-Y format  
✅ **Matches client format** - Exactly as requested  
