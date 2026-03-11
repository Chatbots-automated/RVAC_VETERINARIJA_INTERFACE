# Auto-Load Fix for Gydomų Gyvūnų Registras

## Issue
When opening the "Gydomų gyvūnų registras" section, it was loading ALL rows for all months instead of just the current month.

## Root Cause
The `loadReport()` function was being called before the date filter state (`dateFrom` and `dateTo`) was properly initialized, causing it to fetch all records without date filters.

## Solution
Added a separate `useEffect` hook specifically for the treated animals report that:
1. Waits for `dateFrom` and `dateTo` to be set
2. Only then calls `loadReport()`
3. Ensures date filters are applied before fetching data

## Code Changes

### File: `src/components/Reports.tsx`

**Before:**
```typescript
useEffect(() => {
  loadFilterOptions();
  if (reportType === 'analytics') {
    loadAnalytics();
  } else {
    loadReport(); // Called immediately, dateFrom/dateTo might not be set yet
  }
}, [reportType]);
```

**After:**
```typescript
useEffect(() => {
  loadFilterOptions();
  if (reportType === 'analytics') {
    loadAnalytics();
  } else if (reportType !== 'treated_animals') {
    // For other reports, load immediately
    loadReport();
  }
  // For treated_animals, wait for date filters to be set (handled in separate useEffect)
}, [reportType]);

// Auto-load treated_animals report with current month filters
useEffect(() => {
  if (reportType === 'treated_animals' && dateFrom && dateTo) {
    loadReport();
  }
}, [reportType, dateFrom, dateTo]);
```

## How It Works

### Flow:
1. User opens **Ataskaitos** tab
2. Selects **"Gydomų gyvūnų registras"**
3. Component initializes with:
   - `dateFrom` = First day of current month (e.g., "2026-02-01")
   - `dateTo` = Last day of current month (e.g., "2026-02-28")
4. Second `useEffect` detects:
   - `reportType === 'treated_animals'` ✓
   - `dateFrom` is set ✓
   - `dateTo` is set ✓
5. Calls `loadReport()` with date filters applied
6. Fetches only current month's data

### Other Reports:
- Other report types (drug_journal, biocide_journal, etc.) still load immediately
- No impact on their functionality

## Testing

### Test Case 1: Initial Load
1. Go to **Ataskaitos** tab
2. Click **"Gydomų gyvūnų registras"**
3. **Expected**: Shows only current month's data
4. **Verify**: Check date filters show current month dates

### Test Case 2: Change Date Range
1. In "Gydomų gyvūnų registras"
2. Change **Data nuo** to "2025-01-01"
3. Change **Data iki** to "2025-12-31"
4. Click **"Generuoti ataskaitą"**
5. **Expected**: Shows all data for 2025

### Test Case 3: Other Reports
1. Click **"Veterinarinių vaistų žurnalas"**
2. **Expected**: Loads immediately (no delay)
3. Click **"Biocidų žurnalas"**
4. **Expected**: Loads immediately (no delay)

## Benefits

✅ **Auto-loads current month** - No need to click "Generuoti ataskaitą"
✅ **Proper date filtering** - Only shows current month's data
✅ **Better UX** - Instant results when opening the report
✅ **No breaking changes** - Other reports work as before

## Summary

The treated animals report now:
1. ✅ Auto-loads when opened
2. ✅ Shows only current month's data
3. ✅ Applies date filters correctly
4. ✅ Doesn't affect other reports

No database changes needed - this is purely a frontend fix!
