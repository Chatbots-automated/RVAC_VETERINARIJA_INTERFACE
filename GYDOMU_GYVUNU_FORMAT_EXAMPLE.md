# GYDOMŲ GYVŪNŲ REGISTRACIJOS ŽURNALAS - Format Example

## New Format (After Update)

### Example Treatment Record (Multiple Rows)

**Row 1:**
- **Eil. Nr.**: 428
- **Registracijos data**: 2025-10-02
- **Gyvūno laikytojas**: ŽŪB "Berčiūnai"
- **Ženklinimo Nr.**: 08945411
- **Gyvūnas / rūšis**: Karvė
- **Amžius**: 3 m.
- **Klinikinė diagnozė**: Mastitas
- **Atlikti tyrimai**: Temperatūra: 39.5°C
- **Gydymas**: Mastijet Forte 8g N20
- **Dozė**: 2 vnt
- **Išlauka**: 🥩 2025-10-06, 🥛 2025-10-16
- **Baigtis**: -
- **Veterinaras**: Artūras Abromaitis

**Row 2:**
- **Eil. Nr.**: 428
- **Registracijos data**: 2025-10-02
- **Gyvūno laikytojas**: ŽŪB "Berčiūnai"
- **Ženklinimo Nr.**: 08945411
- **Gyvūnas / rūšis**: Karvė
- **Amžius**: 3 m.
- **Klinikinė diagnozė**: Mastitas
- **Atlikti tyrimai**: Temperatūra: 39.5°C
- **Gydymas**: Ketoprocen 100 mg/ml
- **Dozė**: 20 ml
- **Išlauka**: 🥛 2025-10-06
- **Baigtis**: -
- **Veterinaras**: Artūras Abromaitis

**Row 3:**
- **Eil. Nr.**: 428
- **Registracijos data**: 2025-10-02
- **Gyvūno laikytojas**: ŽŪB "Berčiūnai"
- **Ženklinimo Nr.**: 08945411
- **Gyvūnas / rūšis**: Karvė
- **Amžius**: 3 m.
- **Klinikinė diagnozė**: Mastitas
- **Atlikti tyrimai**: Temperatūra: 39.5°C
- **Gydymas**: Vitalene C inj.100ml
- **Dozė**: 15 ml
- **Išlauka**: -
- **Baigtis**: Pasveiko
- **Veterinaras**: Artūras Abromaitis

---

## Eil. Nr. (Sequential Number) Logic

### How it works:
- **Resets based on filtered date range**
- **Increments sequentially by registration date**
- **Multiple treatments on same day get consecutive numbers**

### Example:

| Reg. Data  | Gyvūnas | Eil. Nr. |
|------------|---------|----------|
| 2025-10-02 | 08945411 | 428 |
| 2025-10-02 | 08945412 | 429 |
| 2025-10-03 | 08945411 | 430 |
| 2025-10-09 | 08945413 | 431 |

### When filtering:
- **Filter: October 2025** → Eil. Nr. starts at 1
- **Filter: October-November 2025** → Eil. Nr. continues across months
- **Filter: Specific animal** → Eil. Nr. only counts that animal's treatments

---

## Withdrawal Period Format

### Display Format: Dates Only
- **🥩**: Meat withdrawal date
- **🥛**: Milk withdrawal date
- **-**: No withdrawal period

### Examples:
- `🥩 2025-10-06, 🥛 2025-10-16` = Meat until Oct 6, Milk until Oct 16
- `🥛 2025-10-06` = Only milk withdrawal until Oct 6
- `-` = No withdrawal period

### Calculation:
- Each medicine has its own withdrawal period
- Calculated from registration date + withdrawal days
- Example:
  - Registration: 2025-10-02
  - Medicine A: 4 days meat, 14 days milk → 🥩 2025-10-06, 🥛 2025-10-16
  - Medicine B: 0 days meat, 4 days milk → 🥛 2025-10-06
  - Medicine C: 0 days meat, 0 days milk → -

---

## Medication Display Format

### Format: One Row Per Medicine

Each medicine gets its own row with:
- Medicine name in "Gydymas" column
- Dose in separate display below medicine name

### Single Medicine:
```
Gydymas: Mastijet Forte 8g N20
Dozė: 2 vnt
```

### Multiple Medicines (Multiple Rows):
```
Row 1: Mastijet Forte 8g N20 | Dozė: 2 vnt
Row 2: Ketoprocen 100 mg/ml | Dozė: 20 ml
Row 3: Vitalene C inj.100ml | Dozė: 15 ml
```

### Multi-day Course:
```
Gydymas: Mastijet Forte 8g N20
Dozė: 2 vnt × 5 d.
```
- Shows daily dose and number of days

---

## Comparison with Client's Format

### Client's Original Format:
```
Eil. Nr.: 428
Gydymas: Mastijet Forte 8g N20
Dozė: 2
Išlauka: p-4;m-14

Eil. Nr.: 428
Gydymas: Ketoprocen 100 mg/ml
Dozė: 20
Išlauka: p-0;m-4

Eil. Nr.: 428
Gydymas: Vitalene C inj.100ml
Dozė: 15
Išlauka: p-0;m-0
```
*Multiple rows per treatment (one per medicine)*

### New Format:
```
Eil. Nr.: 428 | Gydymas: Mastijet Forte 8g N20 | Dozė: 2 vnt | Išlauka: 🥩 2025-10-06, 🥛 2025-10-16
Eil. Nr.: 428 | Gydymas: Ketoprocen 100 mg/ml | Dozė: 20 ml | Išlauka: 🥛 2025-10-06
Eil. Nr.: 428 | Gydymas: Vitalene C inj.100ml | Dozė: 15 ml | Išlauka: -
```
*Multiple rows per treatment (one per medicine) - SAME AS CLIENT*

### Benefits:
✅ **Matches client format** - One row per medicine  
✅ **Clear medicine details** - Each medicine clearly separated  
✅ **Individual withdrawals** - Each medicine shows its own withdrawal dates  
✅ **Better for auditing** - Easy to verify each medicine used  
✅ **Official format** - Complies with Lithuanian veterinary regulations  

---

## Usage Instructions

### 1. Generate Report
1. Go to **Ataskaitos** tab
2. Select **"Gydomų gyvūnų registras"**
3. Set date filters (e.g., "Data nuo: 2025-10-01", "Data iki: 2025-10-31")
4. Click **"Generuoti ataskaitą"**

### 2. Filter Options
- **Data nuo/iki**: Date range filter
- **Gyvūnas**: Filter by specific animal
- **Liga**: Filter by disease
- **Produktas**: Filter by medicine used
- **Veterinaras**: Filter by veterinarian

### 3. Export
- **Spausdinti**: Print the report
- **Eksportuoti**: Export to CSV

---

## Notes

### Eil. Nr. Behavior:
- ✅ Resets when changing date filters
- ✅ Sequential within filtered range
- ✅ Consistent across exports

### Medication Information:
- ✅ Shows all medicines used in treatment
- ✅ Includes dose, unit, and withdrawal period
- ✅ Separates immediate treatments from multi-day courses

### Withdrawal Periods:
- ✅ Calculated from product database
- ✅ Shows maximum of all medicines used
- ✅ Displays both format (p-X;m-Y) and actual dates
