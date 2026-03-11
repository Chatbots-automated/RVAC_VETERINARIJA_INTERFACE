# Real-Time Drug Journal - How It Works

## Overview

The Veterinary Drug Journal (VETERINARINIŲ VAISTŲ IR VAISTINIŲ PREPARATŲ APSKAITOS ŽURNALAS) automatically updates in **real-time** as medicines are used in treatments. No manual entry is needed - the system tracks everything automatically.

## 🔄 Real-Time Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    1. RECEIVE MEDICINE STOCK                        │
│                                                                     │
│  User receives medicine → Creates batch in system                   │
│  ├─ Product: Medicine name                                          │
│  ├─ Supplier: Company name                                          │
│  ├─ Document: Sąskaita faktūra Nr. XXX                             │
│  ├─ Received quantity: 100 ml                                       │
│  └─ Batch/Serial number: B-001                                      │
│                                                                     │
│  ✅ Batch appears in Drug Journal with full quantity               │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    2. CREATE TREATMENT                              │
│                                                                     │
│  User treats animal → Adds medicine to treatment                    │
│  ├─ Animal: Cow #123                                                │
│  ├─ Medicine: Select from batch B-001                               │
│  ├─ Quantity used: 10 ml                                            │
│  └─ Complete treatment                                              │
│                                                                     │
│  🤖 AUTOMATIC: System creates entry in usage_items table            │
│     - Links to batch_id                                             │
│     - Records quantity used (10 ml)                                 │
│     - Timestamp of usage                                            │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    3. DRUG JOURNAL AUTO-UPDATES                     │
│                                                                     │
│  View: vw_vet_drug_journal automatically recalculates:              │
│  ├─ Gautas kiekis (Received): 100 ml (unchanged)                   │
│  ├─ Sunaudotas kiekis (Used): 10 ml ← REAL-TIME                    │
│  └─ Likutis (Remaining): 90 ml ← CALCULATED                        │
│                                                                     │
│  ✅ Report shows updated quantities immediately                    │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    4. CONTINUOUS UPDATES                            │
│                                                                     │
│  Every time medicine is used:                                       │
│  ├─ Treatment → usage_items updated                                 │
│  ├─ Vaccination → usage_items updated                               │
│  ├─ Synchronization → usage_items updated                           │
│  └─ Biocide application → usage_items updated                       │
│                                                                     │
│  Drug Journal reflects changes IMMEDIATELY                          │
└─────────────────────────────────────────────────────────────────────┘
```

## 📊 Database Structure

### Tables Involved

1. **batches** - Stores received medicine stock
   - `id` - Batch identifier
   - `product_id` - Medicine/product
   - `supplier_id` - Supplier/company
   - `received_qty` - Total quantity received
   - `doc_title`, `doc_number`, `doc_date` - Document info
   - `batch_number`, `lot` - Serial/batch number
   - `expiry_date` - Expiry date

2. **usage_items** - Records all medicine usage
   - `id` - Usage record identifier
   - `batch_id` - Links to batch
   - `treatment_id` - Links to treatment (if from treatment)
   - `vaccination_id` - Links to vaccination (if from vaccination)
   - `qty` - Quantity used
   - `created_at` - When it was used

3. **vw_vet_drug_journal** (VIEW) - Real-time journal report
   - Joins batches, products, suppliers
   - **Calculates** `quantity_used` by summing usage_items
   - **Calculates** `quantity_remaining` = received - used

### Real-Time Calculation

```sql
-- This happens automatically every time you open the report
quantity_used = (SELECT SUM(ui.qty) FROM usage_items ui WHERE ui.batch_id = b.id)
quantity_remaining = received_qty - quantity_used
```

## 🎯 Usage Scenarios

### Scenario 1: Regular Treatment
```
Doctor treats cow with antibiotic
├─ Opens animal record
├─ Creates new treatment/visit
├─ Adds medicine (selects batch, enters quantity)
└─ Completes treatment

Result: ✅ Medicine automatically deducted from batch
        ✅ Drug Journal shows updated quantities
        ✅ Stock level updated in real-time
```

### Scenario 2: Vaccination Program
```
Doctor vaccinates multiple animals
├─ Opens vaccination module
├─ Selects vaccine and batch
├─ Records vaccination for each animal
└─ System tracks dosage per animal

Result: ✅ Each vaccination creates usage_item entry
        ✅ Total vaccine usage summed automatically
        ✅ Remaining stock calculated in real-time
```

### Scenario 3: Synchronization Medicine
```
Hormone for estrus synchronization
├─ Creates synchronization protocol
├─ Schedules hormone doses for multiple days
├─ Each day's dose is completed
└─ Medicine is deducted per dose

Result: ✅ Each dose completion updates usage_items
        ✅ Progressive stock reduction tracked
        ✅ Journal shows cumulative usage
```

### Scenario 4: Multiple Batches of Same Medicine
```
Medicine A has 3 batches:
├─ Batch B-001: Expires 2025-12-01, 50 ml left
├─ Batch B-002: Expires 2026-06-01, 100 ml left
└─ Batch B-003: Expires 2026-12-01, 200 ml left

When treating animals:
├─ System uses oldest batch first (FIFO)
├─ Each usage tracked to specific batch
└─ Journal shows separate rows for each batch

Result: ✅ Clear visibility of which batch is being used
        ✅ Easy to see expiry dates and plan usage
        ✅ Prevents waste from expired medicines
```

## 📋 What Appears in the Report

### Medicine Header (per medicine)
- **Veterinarinio vaisto pavadinimas**: Product name
- **Registration code**: If available
- **Active substance**: If available
- **Pirminė pakuotė (mato vnt.)**: Unit (ml, g, kg, etc.)

### Table Rows (per batch)
Each row represents ONE batch of the medicine with:

| Column | Description | Real-Time? |
|--------|-------------|------------|
| **Gavimo data** | Date when batch was received | Static |
| **Dokumento info** | Supplier name, document title, sąskaita faktūra number, date | Static |
| **Gautas kiekis** | Quantity received in this batch | Static |
| **Tinkamumo naudoti laikas** | Expiry date | Static |
| **Serija** | Batch/serial number | Static |
| **Sunaudotas kiekis** | Total used from this batch | ✅ **REAL-TIME** |
| **Likutis** | Remaining quantity | ✅ **REAL-TIME** |

### Summary Row (per medicine)
- **Viso gautas kiekis**: Sum of all batches' received quantities
- **Viso sunaudotas**: Sum of all batches' used quantities ✅ **REAL-TIME**
- **Viso likutis**: Sum of all batches' remaining quantities ✅ **REAL-TIME**

## 🚀 Key Benefits

1. **No Manual Entry**
   - Medicine usage is recorded during normal workflow
   - No separate journal entry step needed

2. **Accurate Stock Levels**
   - Always shows current stock
   - Prevents over-prescribing (system checks stock before allowing treatment)

3. **Audit Trail**
   - Every usage linked to specific treatment/vaccination
   - Full traceability: who used what, when, on which animal

4. **Regulatory Compliance**
   - Automatic journal generation for inspections
   - All data tracked according to veterinary regulations
   - Ready to print at any time

5. **Batch Management**
   - Track usage per batch/serial number
   - Monitor expiry dates
   - Ensure FIFO (first-in-first-out) usage

## 🔍 Checking Real-Time Updates

### Test the Real-Time Functionality:

1. **Before Treatment:**
   - Open Drug Journal
   - Note the "Likutis" (remaining) for a specific batch
   - Example: Batch B-001 has 50 ml remaining

2. **Create Treatment:**
   - Open animal record
   - Create new treatment
   - Use 10 ml from Batch B-001
   - Complete the treatment

3. **After Treatment:**
   - Refresh Drug Journal (or just open it again)
   - Check Batch B-001
   - "Sunaudotas kiekis" increased by 10 ml ✅
   - "Likutis" decreased to 40 ml ✅

**No waiting, no sync button, no manual entry - it just works!**

## 🛡️ Data Integrity

### Automatic Validations:
- ✅ Can't use more than available in batch
- ✅ Can't use from expired batches
- ✅ Can't delete usage records after treatment is completed
- ✅ All quantities must be positive numbers
- ✅ Stock levels protected by database constraints

### Automatic Stock Management:
- When batch reaches 0, marked as depleted
- Medical waste automatically generated for empty medicine vials
- Batch status updated automatically

## 📱 Where Medicine Usage is Tracked

Medicine usage is automatically recorded in these modules:

1. **Gydymas (Treatments)** → Treatment module
2. **Vakcinacijos (Vaccinations)** → Vaccination module  
3. **Sinchronizacija (Synchronization)** → Estrus sync protocols
4. **Biocidiniai produktai (Biocides)** → Disinfection/sanitation

All feed into the same `usage_items` table, all appear in Drug Journal.

## 🎓 User Training Points

### For Veterinarians:
- "Just treat animals normally - the journal updates itself"
- "Always select the correct batch when using medicine"
- "Check stock levels before starting treatments"

### For Administrators:
- "Generate Drug Journal anytime for inspections"
- "Filter by date, product, or batch as needed"
- "Print-ready format, no additional formatting needed"

### For Inventory Managers:
- "Monitor stock levels in real-time"
- "Set up alerts for low stock or expiring batches"
- "Order new stock based on actual usage patterns"

## 🔒 Compliance & Auditing

The system provides full compliance with Lithuanian veterinary regulations:

- **Real-time tracking**: Every gram/ml accounted for
- **Audit trail**: Complete history of who used what, when
- **Document references**: Linked to purchase documents
- **Batch tracking**: Serial numbers tracked throughout
- **Expiry management**: Expired items highlighted
- **Ready for inspection**: Generate report instantly

## Summary

The Drug Journal is **not a separate data entry system** - it's a **real-time view** of your medicine usage that updates automatically as you work. When you treat animals, the journal tracks everything for you. No extra work, complete accuracy, full compliance.
