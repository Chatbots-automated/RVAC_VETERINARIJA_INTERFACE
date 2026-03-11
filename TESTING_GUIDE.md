# Testing Guide - Veterinary Drug Journal Update

## Pre-Testing Checklist

- [ ] Apply database migration: `supabase/migrations/20260210000000_update_vet_drug_journal_view.sql`
- [ ] Restart development server if running
- [ ] Clear browser cache (optional, but recommended)

## Step-by-Step Testing

### 1. Access the Report

1. Log in to the OKSANA system
2. Navigate to **Ataskaitos** (Reports) tab
3. Locate **"Veterinarinių vaistų žurnalas"** in the report list
4. Click to open the report interface

### 2. Test Without Filters (All Data)

**Expected Result:**
- Report shows all medicines in the system
- Each medicine has:
  - Header section with medicine name and unit
  - Table with all batches for that medicine
  - Summary row showing totals
- Medicines are ordered by receipt date (newest first)

**Visual Check:**
```
✓ Header shows medicine name
✓ Header shows primary package unit (ml, g, kg, etc.)
✓ Registration code displayed (if available)
✓ Active substance displayed (if available)
✓ Table has exactly 7 columns
✓ Summary row at bottom of each medicine table
```

### 3. Test Date Range Filter

1. Set **Date From**: e.g., 2024-01-01
2. Set **Date To**: e.g., 2024-12-31
3. Click **Generuoti ataskaitą** (Generate Report)

**Expected Result:**
- Only batches received within the date range are shown
- Medicines with no batches in that range don't appear
- Date filter applies to "Gavimo data" (receipt date)

### 4. Test Product Filter

1. Select a specific medicine from the **Produktas** dropdown
2. Generate report

**Expected Result:**
- Only the selected medicine appears
- All batches for that medicine are shown
- Header shows correct medicine information

### 5. Test Batch Filter

1. Enter a batch number in the **Serija** field (e.g., "B-001")
2. Generate report

**Expected Result:**
- Only batches matching the search term are shown
- Search is case-insensitive
- Partial matches work (e.g., "B-0" matches "B-001", "B-002", etc.)

### 6. Test Invoice Filter

1. Enter an invoice number in the **Sąskaita** field (e.g., "SF-001")
2. Generate report

**Expected Result:**
- Only batches with matching invoice numbers appear
- Search is case-insensitive

### 7. Test Data Display

**Column Checks:**

1. **Gavimo data** (Receipt Date)
   - Shows date in Lithuanian format (YYYY-MM-DD)
   - Sorted by date (newest first)

2. **Dokumento info** (Document Info)
   - Shows document title (if available)
   - Shows invoice number (if available)
   - Shows invoice date (if available)
   - Shows "-" if all fields are empty

3. **Gautas kiekis** (Received Quantity)
   - Shows numeric value
   - Displayed in blue badge
   - Aligned to the right

4. **Tinkamumo naudoti laikas** (Expiry Date)
   - Shows date in Lithuanian format
   - **RED TEXT** if expired (date in past)
   - Normal text if not expired

5. **Serija** (Batch/Serial)
   - Shows batch_number or lot
   - Displayed in gray badge

6. **Sunaudotas kiekis** (Used Quantity)
   - Shows numeric value
   - Red text (indicates stock reduction)
   - Aligned to the right

7. **Likutis** (Remaining)
   - Shows numeric value
   - **Green badge** if quantity > 0
   - **Gray badge** if quantity = 0

**Summary Row:**
- Labeled "Viso (Medicine Name):"
- Shows totals for:
  - Gautas kiekis (sum of all received)
  - Sunaudotas kiekis (sum of all used)
  - Likutis (sum of all remaining)

### 8. Test Print Functionality

1. Click the **Print** button or press Ctrl+P (Windows) / Cmd+P (Mac)
2. Review print preview

**Expected Print Behavior:**
✓ Header section (medicine info) stays with its table (no page break between)
✓ Summary row stays with its table
✓ Colors are preserved
✓ Border and styling intact
✓ No extra margins or spacing issues
✓ Footer information (Viso vaistų, Viso įrašų, Tiekėjai) is hidden in print

### 9. Test Edge Cases

**Empty Data:**
1. Filter by a date range with no data
2. **Expected:** "Nėra duomenų" (No data) message

**Single Batch:**
1. Filter to show a medicine with only one batch
2. **Expected:** Header + table with 1 row + summary row

**Many Batches:**
1. Filter to show a medicine with many batches (10+)
2. **Expected:** All batches displayed, scrollable if needed, summary at bottom

**Missing Fields:**
1. Check a batch with no document info
2. **Expected:** Shows "-" in document column

**Expired Medicine:**
1. Find a batch with expiry_date in the past
2. **Expected:** Expiry date shows in RED

**Zero Stock:**
1. Find a batch with quantity_remaining = 0
2. **Expected:** Remaining shown in GRAY badge

### 10. Test Calculations

**Verify Math:**
For any medicine, manually verify:
```
Gautas kiekis (total) = sum of all batches' received quantities
Sunaudotas kiekis (total) = sum of all batches' used quantities
Likutis (total) = sum of all batches' remaining quantities
```

Also verify for each batch:
```
Likutis = Gautas kiekis - Sunaudotas kiekis
```

### 11. Performance Test

**Large Dataset:**
1. Generate report with no filters (all data)
2. Check loading time

**Expected:**
- Report loads within 2-5 seconds for hundreds of records
- No browser freezing or lag
- Smooth scrolling

### 12. Cross-Browser Testing

Test in:
- [ ] Chrome/Edge (Chromium)
- [ ] Firefox
- [ ] Safari (if available)

All features should work identically.

## Common Issues & Solutions

### Issue: Medicine name shows "undefined" or "-"
**Solution:** Check that `product_name` exists in the database view

### Issue: No grouping, all batches in flat list
**Solution:** Check that `product_id` is available in the data

### Issue: Summary row calculations wrong
**Solution:** Verify `parseFloat()` is working correctly, check for NaN values

### Issue: Print breaks medicine groups
**Solution:** Verify `.page-break-inside-avoid` CSS class is applied

### Issue: Document title not showing
**Solution:** Ensure migration was applied to add `doc_title` to the view

## Success Criteria

✅ All medicines grouped correctly
✅ Headers display complete medicine information
✅ Tables have exactly 7 columns
✅ Summary rows show correct totals
✅ Filters work as expected
✅ Print layout is clean and professional
✅ Expired items highlighted in red
✅ Zero-stock items shown in gray
✅ No errors in browser console
✅ No linter errors

## Rollback Plan

If issues occur:

1. **Revert ReportTemplates.tsx** to previous version
2. **Revert database view** by running:
   ```sql
   -- Run the old view definition from schema_latest_public.sql
   -- (lines 8269-8294)
   ```
3. **Clear browser cache**
4. **Restart development server**

## Post-Testing

After successful testing:
- [ ] Document any edge cases found
- [ ] Note any performance issues
- [ ] Gather user feedback
- [ ] Update training materials if needed
