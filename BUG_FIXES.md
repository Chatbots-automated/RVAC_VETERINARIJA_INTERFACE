# Bug Fixes - Drug Journal Report

## Issue 1: "Invoice" Text Appearing

### Problem
When `doc_title` field contained "Invoice", it was showing:
```
UAB "Partnervetas"
Invoice                    ← Redundant
Sąskaita faktūra Nr. PVET00037812
2026-01-06
```

### Solution
Filter out "Invoice" text from `doc_title` if it's the only content (case-insensitive)

### Code Change
```typescript
{batch.doc_title && batch.doc_title.toLowerCase() !== 'invoice' && 
  <div className="font-medium text-gray-900">{batch.doc_title}</div>
}
```

### Result
Now shows:
```
UAB "Partnervetas"
Sąskaita faktūra Nr. PVET00037812
2026-01-06
```

---

## Issue 2: Scientific Notation in Quantities

### Problem
Very small floating-point errors (from database calculations) were displaying as:
```
Sunaudotas kiekis: -4e-15
Likutis: -4e-15
```

This is JavaScript showing `-0.000000000000004` in scientific notation - essentially zero.

### Root Cause
Floating-point arithmetic precision issues in PostgreSQL calculations:
```sql
quantity_remaining = received_qty - SUM(usage_items.qty)
```

When `received_qty = 5000` and `SUM(usage) = 5000.000000000000004`, the result is `-0.000000000000004`

### Solution
1. Treat any number with absolute value < 0.01 as zero
2. Format all numbers to 2 decimal places
3. Apply to both individual rows and summary totals

### Code Changes

**Individual Rows:**
```typescript
// Used quantity
{Math.abs(parseFloat(batch.quantity_used) || 0) < 0.01 
  ? '0' 
  : (parseFloat(batch.quantity_used) || 0).toFixed(2)
}

// Remaining quantity
{Math.abs(parseFloat(batch.quantity_remaining) || 0) < 0.01 
  ? '0' 
  : (parseFloat(batch.quantity_remaining) || 0).toFixed(2)
}
```

**Summary Totals:**
```typescript
{(() => {
  const total = medicine.batches.reduce(
    (sum: number, b: any) => sum + (parseFloat(b.quantity_used) || 0), 
    0
  );
  return Math.abs(total) < 0.01 ? '0.00' : total.toFixed(2);
})()}
```

### Result
Before:
```
Sunaudotas kiekis: -4e-15
Likutis: -4e-15
```

After:
```
Sunaudotas kiekis: 0
Likutis: 0
```

---

## Testing

### Test Case 1: Invoice Text
1. Find a batch with `doc_title = 'Invoice'`
2. Generate report
3. Verify "Invoice" text doesn't appear
4. Verify "Sąskaita faktūra" still shows

### Test Case 2: Scientific Notation
1. Find a fully depleted batch (received = used)
2. Generate report
3. Verify quantities show as "0" or "0.00" (not "-4e-15")
4. Check summary totals also show clean numbers

### Test Case 3: Normal Numbers
1. Find a batch with actual usage
2. Generate report
3. Verify numbers display correctly with 2 decimal places
4. Example: 150.5, not 150.50000000000003

---

## Technical Details

### Why Floating-Point Errors Occur

PostgreSQL (and most databases) use binary floating-point arithmetic, which cannot precisely represent some decimal numbers. When you do:

```sql
5000.0 - 4999.9999999999999
```

The result might be `0.0000000000001` or `-0.0000000000001` due to binary representation limits.

### Why This Approach Works

1. **Threshold Check**: `Math.abs(value) < 0.01`
   - Any number smaller than 1 cent/gram/ml is essentially zero
   - Handles both positive and negative tiny errors

2. **Fixed Decimal Places**: `.toFixed(2)`
   - Ensures consistent formatting (2 decimal places)
   - Prevents excessive precision display

3. **Applied Everywhere**:
   - Individual row values
   - Summary totals
   - Both used and remaining quantities

### Alternative Approaches Considered

❌ **Database-level ROUND()**: Would require view changes and re-migration
❌ **Different numeric types**: Would affect entire system
✅ **Frontend formatting**: Simple, safe, effective

---

## Impact

- ✅ Cleaner document section (no redundant "Invoice" text)
- ✅ Professional number display (no scientific notation)
- ✅ Better user experience (numbers make sense)
- ✅ No database changes needed (frontend fix only)
- ✅ Backwards compatible (handles all existing data)

---

## Related Files

- `src/components/ReportTemplates.tsx` - All fixes applied here
- No database changes required
- No migration needed

---

## Future Improvements

If scientific notation appears in other reports, apply the same pattern:

```typescript
const formatQuantity = (value: any): string => {
  const num = parseFloat(value) || 0;
  return Math.abs(num) < 0.01 ? '0' : num.toFixed(2);
};
```

Could be extracted to a utility function in `lib/formatters.ts` and reused across all reports.
