# Veterinary Medicine Journal Update - 2024 Format

## Summary
Updated the VETERINARINIŲ VAISTŲ IR VAISTINIŲ PREPARATŲ APSKAITOS ŽURNALAS (Veterinary Medicine and Pharmaceutical Products Accounting Journal) to match the official 2024 format.

**✨ Key Feature: Real-Time Updates**
The journal automatically updates as medicines are used in treatments - no manual entry needed! When you create a treatment and use medicine, it immediately appears in the drug journal with updated quantities.

## Changes Made

### 1. Report Template Update (`src/components/ReportTemplates.tsx`)

**Old Format:**
- Single flat table with 10 columns
- All batches listed sequentially regardless of medicine
- Medicine name repeated for every batch

**New Format (2024):**
- Grouped by medicine/product
- Each medicine has a header section with:
  - **Veterinarinio vaisto / vaistinio preparato pavadinimas** (Medicine name)
  - **Pirminė pakuotė (mato vnt.)** (Primary package/unit)
  - Registration code and active substance displayed in header
- Simplified table with **7 columns** per medicine:
  1. **Gavimo data** - Receipt date
  2. **Dokumento, pagal kurį gautas vaistas, pavadinimas, numeris, data** - Supplier/company name, document title, "Sąskaita faktūra Nr.", and date
  3. **Gautas kiekis** - Received quantity
  4. **Tinkamumo naudoti laikas** - Expiry date
  5. **Serija** - Batch/Serial number
  6. **Sunaudotas kiekis** - Used quantity (✅ **REAL-TIME**)
  7. **Likutis** - Remaining quantity (✅ **REAL-TIME**)

**Additional Features:**
- ✅ **Real-time updates**: Medicine usage automatically tracked from treatments
- Summary row at the bottom of each medicine showing totals (received, used, remaining)
- Supplier/company name displayed prominently
- "Sąskaita faktūra" instead of generic "invoice" label
- Expired medicines highlighted in red
- Zero-stock items shown in gray
- Better visual grouping and readability
- Print-friendly with page break avoidance for medicine groups

### 2. Database View Update (`supabase/migrations/20260210000000_update_vet_drug_journal_view.sql`)

**Added Fields:**
- `doc_title` - Document title/name (was missing from the view)
- `lot` - Lot number (in addition to batch_number)
- Comments explaining real-time update mechanism

**Real-Time Mechanism:**
- `quantity_used` = SUM of all entries in `usage_items` table for this batch
- `quantity_remaining` = `received_qty` - `quantity_used`
- Updates automatically when treatments/vaccinations are created
- No manual journal entry needed

**Kept Fields:**
- All existing fields from the original view
- Calculation logic unchanged (already real-time)

**View Structure:**
```sql
SELECT 
  b.id AS batch_id,
  b.product_id,
  b.created_at AS receipt_date,
  p.name AS product_name,
  p.registration_code,
  p.active_substance,
  s.name AS supplier_name,
  b.lot,
  b.batch_number,
  b.mfg_date AS manufacture_date,
  b.expiry_date,
  b.received_qty AS quantity_received,
  p.primary_pack_unit AS unit,
  [quantity_used calculation],
  [quantity_remaining calculation],
  b.doc_title,          -- NEW
  b.doc_number AS invoice_number,
  b.doc_date AS invoice_date
FROM batches b
...
```

### 3. Print Styling Update (`src/index.css`)

Added `.page-break-inside-avoid` class to ensure medicine groups don't split across pages when printing.

## Data Source

The report pulls data from the `vw_vet_drug_journal` view which:
- Filters for medicines and prevention products (`category IN ('medicines', 'prevention')`)
- Joins `batches`, `products`, and `suppliers` tables
- Calculates used and remaining quantities from `usage_items` table
- Orders by receipt date (most recent first)

## How to Apply

### Step 1: Apply Database Migration
Run the SQL migration file in Supabase Dashboard SQL Editor:
```
supabase/migrations/20260210000000_update_vet_drug_journal_view.sql
```

This will update the view to include the `doc_title` field.

### Step 2: Test the Report
1. Navigate to the Ataskaitos (Reports) tab
2. Select "Veterinarinių vaistų žurnalas" (Drug Journal)
3. Apply filters if needed (date range, product, batch, etc.)
4. Generate the report
5. Verify the new format shows:
   - Medicines grouped together
   - Header with medicine name and unit
   - 7-column table per medicine
   - Summary totals per medicine

### Step 3: Print Test
1. Click the print button or use browser print (Ctrl+P / Cmd+P)
2. Verify that:
   - Medicine groups don't split across pages
   - Headers print correctly
   - Colors and formatting are preserved
   - Summary rows are visible

## Benefits of New Format

1. **Real-Time Accuracy**: Medicine usage tracked automatically from treatments - always up-to-date
2. **Compliance**: Matches official 2024 Lithuanian veterinary medicine journal format
3. **Readability**: Easier to see all batches for a specific medicine
4. **Organization**: Natural grouping by product reduces confusion
5. **Totals**: Quick summary of received/used/remaining per medicine
6. **Professional**: Clean, structured format suitable for inspections
7. **No Double Entry**: One workflow - treat animals, journal updates automatically
8. **Audit Trail**: Every medicine use linked to specific treatment/vaccination

## Data Flow

```
1. Stock Receipt:
   batches table (received_qty = 100)
       ↓
   
2. Medicine Usage (Real-Time):
   Create treatment → usage_items table (qty = 10)
       ↓
   
3. Automatic Calculation:
   vw_vet_drug_journal view
       quantity_used = SUM(usage_items.qty) = 10
       quantity_remaining = 100 - 10 = 90
       ↓
   
4. Report Display:
   Reports.tsx (filters & fetches data)
       ↓
   DrugJournalReport component (groups by medicine)
       ↓
   Rendered HTML report (print-ready)
```

## Notes

- The existing database schema didn't need any changes
- All existing filters (date, product, batch, invoice) still work
- The report is backwards compatible - old data displays correctly
- No changes to data entry or stock management workflows
- **Real-time functionality was already built-in** - we just improved the report display
- Medicine usage from treatments, vaccinations, and synchronizations all tracked automatically
- System validates stock availability before allowing medicine use
- Full audit trail maintained for regulatory compliance
