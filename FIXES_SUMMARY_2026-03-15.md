# Fixes Summary - March 15, 2026

## 1. Fixed Drug Journal Quantity Discrepancy

### Problem
- Drug journal (ataskaitos tab) showed: **91ml remaining**
- Inventory (atsargos tab) showed: **89ml remaining**
- **2ml discrepancy** for TEST PRODUKTAS, LOT 02112

### Root Cause
The `vw_vet_drug_journal` view was calculating `quantity_remaining` by summing all `usage_items`:
```sql
(received_qty - SUM(usage_items.qty))
```

But the Inventory component uses `qty_left` from the batches table, which is the authoritative field maintained by database triggers.

### Solution
Updated the view to use `qty_left` as the single source of truth:
```sql
quantity_used = (received_qty - qty_left)
quantity_remaining = qty_left
```

### Files Modified
- `supabase/migrations/20260315000001_fix_drug_journal_qty_left.sql` - New migration
- `supabase/baseline_public.sql` - Updated baseline
- `supabase/schema_latest_public.sql` - Updated schema

---

## 2. Improved Report Exports (CSV → Excel)

### Problem
Reports exported as basic CSV files with:
- No formatting
- Raw column names (database field names)
- No date formatting
- No numeric formatting
- Poor readability

### Solution
Created professional Excel exports with:
- **Formatted headers:** Lithuanian column names
- **Custom widths:** Optimized for each column type
- **Date formatting:** Using formatDateLT (Lithuanian format)
- **Numeric formatting:** 2 decimal places for quantities
- **Bold headers:** Gray background for professional look
- **Report-specific columns:** Each report type has optimized column definitions

### Files Created
- `src/lib/reportExport.ts` - Export utility with column definitions for all report types

### Files Modified
- `src/components/Reports.tsx` - Now uses Excel export instead of CSV

### Supported Reports
1. **Drug Journal** - 13 formatted columns
2. **Treated Animals** - 23 formatted columns  
3. **Biocide Journal** - 11 formatted columns
4. **Insemination Journal** - 10 formatted columns
5. **Medical Waste** - 11 formatted columns

---

## 3. Clarified Išlaidų Module

### Clarification
The Išlaidų (Expenses) module should ONLY show:
- Invoices list
- Products from each invoice

**No cost centers** - that was a misunderstanding.

### Current Setup
- `App.tsx` properly wraps InvoiceViewer with FarmProvider
- InvoiceViewer shows all invoices for selected farm
- Clicking an invoice expands to show all products/items
- Each product shows: name, category, quantity, unit price, total

---

## How to Apply

### Apply Database Migration
```bash
npx supabase db push
```

### Test the Fixes

1. **Test Drug Journal Fix:**
   - Go to Ataskaitos tab
   - Select "Veterinarinių vaistų žurnalas"
   - Check that quantities match inventory
   - TEST PRODUKTAS LOT 02112 should show 89ml in both places

2. **Test Excel Export:**
   - Go to any report (Drug Journal, Treated Animals, etc.)
   - Click "Eksportuoti" button
   - Verify Excel file downloads with proper formatting
   - Check column headers are in Lithuanian
   - Check dates are formatted properly
   - Check numbers have 2 decimal places

3. **Test Išlaidų Module:**
   - Click "Išlaidos" from module selector
   - Select a farm
   - Verify invoices load and display
   - Click an invoice to expand
   - Verify products/items show correctly

---

## Benefits

✅ **Data accuracy:** Drug journal and inventory now show identical quantities  
✅ **Professional exports:** Excel files with proper formatting and Lithuanian headers  
✅ **Better UX:** Readable exports that can be shared with stakeholders  
✅ **Consistency:** Single source of truth (qty_left) used everywhere  
✅ **Working module:** Išlaidų module properly displays invoices and products
