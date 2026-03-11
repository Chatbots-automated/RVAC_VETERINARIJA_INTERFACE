# Example Drug Journal Report Output

## Visual Example of Updated Format

```
═══════════════════════════════════════════════════════════════════════════════
         VETERINARINIŲ VAISTŲ IR VAISTINIŲ PREPARATŲ APSKAITOS ŽURNALAS
                        Sugeneruota: 2024-02-10
═══════════════════════════════════════════════════════════════════════════════


┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  Veterinarinio vaisto / vaistinio preparato pavadinimas:                  ┃
┃  PENSTREP 400                                                              ┃
┃  📋 Reg. kodas: VET-2024-001                                               ┃
┃  💊 Veiklioji medžiaga: Penicilinum + Streptomycinum                       ┃
┃                                                                            ┃
┃  Pirminė pakuotė (mato vnt.): ml                                          ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

┌──────────┬─────────────────────────┬──────────┬───────────┬─────────┬──────────┬────────┐
│ Gavimo   │ Dokumento, pagal kurį   │ Gautas   │Tinkamumo  │ Serija  │Sunaudotas│Likutis │
│ data     │ gautas vaistas,         │ kiekis   │naudoti    │         │ kiekis   │        │
│          │ pavadinimas, numeris,   │          │laikas     │         │          │        │
│          │ data                    │          │           │         │          │        │
├──────────┼─────────────────────────┼──────────┼───────────┼─────────┼──────────┼────────┤
│2024-01-15│ UAB Veterinarija        │   500    │2025-12-01 │ B-12345 │   150.5  │ 349.5  │
│          │ Sąskaita faktūra        │          │           │         │          │        │
│          │ Nr. SF-2024-0123        │          │           │         │          │        │
│          │ 2024-01-15              │          │           │         │          │        │
├──────────┼─────────────────────────┼──────────┼───────────┼─────────┼──────────┼────────┤
│2024-02-01│ UAB Veterinarija        │   500    │2026-01-15 │ B-12401 │   45.0   │ 455.0  │
│          │ Sąskaita faktūra        │          │           │         │          │        │
│          │ Nr. SF-2024-0234        │          │           │         │          │        │
│          │ 2024-02-01              │          │           │         │          │        │
├──────────┼─────────────────────────┼──────────┼───────────┼─────────┼──────────┼────────┤
│          │ Viso (PENSTREP 400):    │  1000.0  │           │         │  195.5   │ 804.5  │
└──────────┴─────────────────────────┴──────────┴───────────┴─────────┴──────────┴────────┘


┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  Veterinarinio vaisto / vaistinio preparato pavadinimas:                  ┃
┃  OXYTOCIN 10 IU                                                            ┃
┃  📋 Reg. kodas: VET-2023-445                                               ┃
┃  💊 Veiklioji medžiaga: Oxytocinum                                         ┃
┃                                                                            ┃
┃  Pirminė pakuotė (mato vnt.): ml                                          ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

┌──────────┬─────────────────────────┬──────────┬───────────┬─────────┬──────────┬────────┐
│ Gavimo   │ Dokumento, pagal kurį   │ Gautas   │Tinkamumo  │ Serija  │Sunaudotas│Likutis │
│ data     │ gautas vaistas,         │ kiekis   │naudoti    │         │ kiekis   │        │
│          │ pavadinimas, numeris,   │          │laikas     │         │          │        │
│          │ data                    │          │           │         │          │        │
├──────────┼─────────────────────────┼──────────┼───────────┼─────────┼──────────┼────────┤
│2023-12-10│ MB Gyvulių vaistinė     │   100    │2024-11-01 │ B-98123 │   100.0  │  0.0   │
│          │ Sąskaita faktūra        │          │ (expired) │         │          │ (empty)│
│          │ Nr. SF-2023-9876        │          │           │         │          │        │
│          │ 2023-12-10              │          │           │         │          │        │
├──────────┼─────────────────────────┼──────────┼───────────┼─────────┼──────────┼────────┤
│2024-01-20│ MB Gyvulių vaistinė     │   200    │2025-12-15 │ B-10234 │   78.5   │ 121.5  │
│          │ Sąskaita faktūra        │          │           │         │          │        │
│          │ Nr. SF-2024-0056        │          │           │         │          │        │
│          │ 2024-01-20              │          │           │         │          │        │
├──────────┼─────────────────────────┼──────────┼───────────┼─────────┼──────────┼────────┤
│          │ Viso (OXYTOCIN 10 IU):  │  300.0   │           │         │  178.5   │ 121.5  │
└──────────┴─────────────────────────┴──────────┴───────────┴─────────┴──────────┴────────┘


┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  Veterinarinio vaisto / vaistinio preparato pavadinimas:                  ┃
┃  MELOXICAM 20 mg/ml                                                        ┃
┃  📋 Reg. kodas: VET-2024-112                                               ┃
┃  💊 Veiklioji medžiaga: Meloxicamum                                        ┃
┃                                                                            ┃
┃  Pirminė pakuotė (mato vnt.): ml                                          ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

┌──────────┬─────────────────────────┬──────────┬───────────┬─────────┬──────────┬────────┐
│ Gavimo   │ Dokumento, pagal kurį   │ Gautas   │Tinkamumo  │ Serija  │Sunaudotas│Likutis │
│ data     │ gautas vaistas,         │ kiekis   │naudoti    │         │ kiekis   │        │
│          │ pavadinimas, numeris,   │          │laikas     │         │          │        │
│          │ data                    │          │           │         │          │        │
├──────────┼─────────────────────────┼──────────┼───────────┼─────────┼──────────┼────────┤
│2024-02-05│ UAB VetMed Plus         │   250    │2026-02-05 │ B-56789 │   12.3   │ 237.7  │
│          │ Prekinė sąskaita        │          │           │         │          │        │
│          │ Sąskaita faktūra        │          │           │         │          │        │
│          │ Nr. PS-2024-0089        │          │           │         │          │        │
│          │ 2024-02-05              │          │           │         │          │        │
├──────────┼─────────────────────────┼──────────┼───────────┼─────────┼──────────┼────────┤
│          │ Viso (MELOXICAM):       │  250.0   │           │         │   12.3   │ 237.7  │
└──────────┴─────────────────────────┴──────────┴───────────┴─────────┴──────────┴────────┘


──────────────────────────────────────────────────────────────────────────────
  Viso vaistų: 3
  Viso įrašų: 5
  Tiekėjai: UAB Veterinarija, MB Gyvulių vaistinė, UAB VetMed Plus
──────────────────────────────────────────────────────────────────────────────
```

## Real-Time Updates Example

### Initial State (Morning):
```
PENSTREP 400 - Batch B-12345
├─ Gautas kiekis: 500 ml
├─ Sunaudotas kiekis: 0 ml
└─ Likutis: 500 ml
```

### After First Treatment (10:00 AM):
Doctor treats Cow #123 with mastitis, uses 15 ml PENSTREP

```
PENSTREP 400 - Batch B-12345
├─ Gautas kiekis: 500 ml
├─ Sunaudotas kiekis: 15 ml      ← Updated automatically!
└─ Likutis: 485 ml               ← Calculated automatically!
```

### After Second Treatment (14:30 PM):
Doctor treats Cow #456 with metritis, uses 20 ml PENSTREP

```
PENSTREP 400 - Batch B-12345
├─ Gautas kiekis: 500 ml
├─ Sunaudotas kiekis: 35 ml      ← Updated automatically! (15 + 20)
└─ Likutis: 465 ml               ← Calculated automatically!
```

### After Multiple Treatments (End of Day):
Throughout the day, multiple animals treated

```
PENSTREP 400 - Batch B-12345
├─ Gautas kiekis: 500 ml
├─ Sunaudotas kiekis: 150.5 ml   ← Sum of all treatments
└─ Likutis: 349.5 ml             ← Remaining stock
```

**No manual journal updates needed - it just works!**

## Document Section Examples

### Example 1: Full Information
```
┌─────────────────────────┐
│ UAB Veterinarija        │  ← Supplier/Company name
│ Prekinė sąskaita        │  ← Document title
│ Sąskaita faktūra        │  ← Label
│ Nr. SF-2024-0123        │  ← Invoice number
│ 2024-01-15              │  ← Invoice date
└─────────────────────────┘
```

### Example 2: Minimal Information (only invoice)
```
┌─────────────────────────┐
│ Sąskaita faktūra        │
│ Nr. SF-2024-0234        │
│ 2024-02-01              │
└─────────────────────────┘
```

### Example 3: No Information
```
┌─────────────────────────┐
│           -             │  ← Shows dash if all fields empty
└─────────────────────────┘
```

## Color Coding (in actual report)

- **Blue badge**: Received quantity (positive action - stock incoming)
- **Red text**: Used quantity (negative action - stock decreasing)
- **Green badge**: Remaining quantity > 0 (stock available)
- **Gray badge**: Remaining quantity = 0 (depleted)
- **Red text**: Expired date (past expiry)
- **Normal text**: Valid expiry date

## Print Format

When printed:
- ✅ Each medicine group stays together (no page breaks in middle)
- ✅ Headers print clearly
- ✅ Colors preserved
- ✅ Summary rows included
- ✅ Footer statistics hidden (no-print class)

## Filter Examples

### Filter by Date Range
```
Date From: 2024-01-01
Date To: 2024-01-31

Result: Only shows batches received in January 2024
```

### Filter by Product
```
Product: PENSTREP 400

Result: Only shows PENSTREP 400 batches (all time periods)
```

### Filter by Batch/Serial
```
Serija: B-12

Result: Shows all batches with "B-12" in serial number
        (B-12345, B-12401, etc.)
```

### Filter by Invoice
```
Sąskaita: SF-2024-01

Result: Shows batches from invoices containing "SF-2024-01"
        (SF-2024-0123, SF-2024-0145, etc.)
```

### Combined Filters
```
Date From: 2024-01-01
Date To: 2024-01-31
Product: PENSTREP 400

Result: PENSTREP 400 batches received in January 2024 only
```

## Usage Scenarios

### Veterinary Inspection
Inspector arrives, requests medicine journal:
1. Click Ataskaitos → Veterinarinių vaistų žurnalas
2. Select date range (e.g., last 3 months)
3. Click Generate
4. Click Print
5. Hand to inspector - **Done!**

### Monthly Inventory
End of month stock check:
1. Generate report (no filters = all data)
2. Check "Likutis" column for each medicine
3. Note medicines with low stock
4. Order new batches as needed

### Batch Tracking
Check usage of specific batch:
1. Enter batch number in Serija filter
2. Generate report
3. See exactly how much was used
4. See when it will run out (based on usage rate)

### Supplier Analysis
Review purchases from specific supplier:
1. Generate full report
2. Look at "Dokumento info" column
3. All purchases from that supplier visible
4. Can verify invoice numbers match records
