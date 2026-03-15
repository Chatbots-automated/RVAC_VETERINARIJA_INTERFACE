# Complete Fixes - March 15, 2026

## 1. Fixed Drug Journal Quantity Discrepancy ✅

### Problem
- Drug journal (ataskaitos tab) showed: **91ml remaining**
- Inventory (atsargos tab) showed: **89ml remaining**
- **2ml discrepancy** for TEST PRODUKTAS, LOT 02112

### Solution
Updated `vw_vet_drug_journal` view to use `qty_left` (authoritative field) instead of recalculating from usage_items.

**Migration:** `supabase/migrations/20260315000001_fix_drug_journal_qty_left.sql`

**Status:** ✅ Applied and working

---

## 2. Added Package Weight Field to Invoice Upload ✅

### Problem
When uploading invoices and clicking "Sukurti naują" to create a product:
- The "Pakuotės svoris (tuščios)" field was missing
- This field is needed for automatic medical waste generation
- Field exists in Products tab but not in Priėmimas tab

### How It Works
The `package_weight_g` field (empty package weight in grams) is used to automatically generate medical waste entries when a batch is fully depleted:

**Formula:** `Total waste = package_count × package_weight_g`

**Example:**
- Product: TEST PRODUKTAS
- Package weight: 45.5g
- Received: 5 packages
- When fully used → Auto-creates waste entry: 227.5g (5 × 45.5g)

### Solution
Added `package_weight_g` field to the product creation modal in ReceiveStock component.

**Files Modified:**
- `src/components/ReceiveStock.tsx`
  - Added `package_weight_g` to `newProductForm` state
  - Added field to product creation modal UI
  - Included in product insert data
  - Reset properly when modal closes

**Field Details:**
- Label: "Pakuotės svoris (tuščios)" with "g" indicator
- Type: Number input with 0.1 step
- Placeholder: "pvz., 45.5"
- Help text: "Tuščios pakuotės svoris gramais. Automatiškai sukuriamas medicininių atliekų įrašas kai visas paketas panaudotas."

---

## 3. Improved Report Exports (CSV → Excel) ✅

### Problem
Reports exported as basic CSV with no formatting.

### Solution
Created professional Excel exports with:
- **Lithuanian column headers** (not database field names)
- **Custom column widths** optimized for each column
- **Date formatting** using formatDateLT
- **Numeric formatting** with 2 decimal places
- **Bold headers** with gray background
- **Report-specific columns** for each report type

**New File:** `src/lib/reportExport.ts`

**Files Modified:** `src/components/Reports.tsx`

**Supported Reports:**
1. Drug Journal - 13 formatted columns
2. Treated Animals - 23 formatted columns
3. Biocide Journal - 11 formatted columns
4. Insemination Journal - 10 formatted columns
5. Medical Waste - 11 formatted columns

---

## 4. Clarified Išlaidų Module ✅

### Clarification
The Išlaidų (Expenses) module shows **ONLY**:
- ✅ Invoices list
- ✅ Products from each invoice
- ❌ NO cost centers

### Current Setup
- Properly wrapped with FarmProvider
- InvoiceViewer displays all invoices for selected farm
- Click invoice to expand and see products
- Shows product name, category, quantity, prices

---

## Testing Checklist

### Test Drug Journal Fix
- [x] Go to Ataskaitos → Veterinarinių vaistų žurnalas
- [x] Verify quantities match inventory
- [x] TEST PRODUKTAS LOT 02112 shows same value in both places

### Test Package Weight Field
- [ ] Go to Priėmimas tab
- [ ] Upload an invoice
- [ ] Click "Sukurti naują" on an unmatched product
- [ ] Verify "Pakuotės svoris (tuščios)" field appears
- [ ] Fill in package weight (e.g., 45.5)
- [ ] Create product
- [ ] Use product until batch depleted
- [ ] Check Medicininių Atliekų Žurnalas for auto-generated entry

### Test Excel Export
- [ ] Go to Ataskaitos
- [ ] Select any report type
- [ ] Click "Eksportuoti"
- [ ] Verify Excel file downloads (not CSV)
- [ ] Open file and check:
  - [ ] Headers are in Lithuanian
  - [ ] Dates are formatted properly
  - [ ] Numbers have 2 decimals
  - [ ] Columns are properly sized
  - [ ] Headers are bold with gray background

### Test Išlaidų Module
- [ ] Click "Išlaidos" from module selector
- [ ] Select a farm
- [ ] Verify invoices load
- [ ] Click an invoice to expand
- [ ] Verify products display correctly

---

## Files Changed

### Database Migrations
- `supabase/migrations/20260315000001_fix_drug_journal_qty_left.sql`
- `supabase/baseline_public.sql`
- `supabase/schema_latest_public.sql`

### Frontend Components
- `src/components/ReceiveStock.tsx` - Added package_weight_g field
- `src/components/Reports.tsx` - Excel export instead of CSV
- `src/App.tsx` - Added FarmProvider to islaidos module

### New Files
- `src/lib/reportExport.ts` - Excel export utility with column definitions

---

## Benefits

✅ **Accurate data:** Drug journal and inventory show identical quantities  
✅ **Medical waste tracking:** Package weight can now be set during invoice upload  
✅ **Professional exports:** Excel files with proper Lithuanian formatting  
✅ **Complete workflow:** Can set package weight at any product creation point  
✅ **Automatic waste:** System auto-generates waste entries when batches depleted
