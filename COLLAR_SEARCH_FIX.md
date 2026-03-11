# Collar Number Search Fix

## Issue

In the "Gyvūnai" tab, when searching by collar number (kaklo numeris), the search was doing **partial matching** instead of **exact matching**.

### Problem Example

User searches for: `101`

**Before (Partial Match)**: ❌
- Matches: `101`, `1017`, `2101`, `1010`, `1015`, etc.
- Returns too many results

**After (Exact Match)**: ✅
- Matches: `101` only
- Returns exactly what the user wants

## Root Cause

Both `Animals.tsx` and `AnimalsCompact.tsx` used `.includes()` for collar number search:

```typescript
// OLD CODE (WRONG)
matchesNeck = collarNo.includes(searchStr);  // Partial match
```

This caused the search to match any collar number **containing** the search term, not just exact matches.

## The Fix

Changed both files to use exact matching with `===`:

```typescript
// NEW CODE (CORRECT)
matchesNeck = collarNo === searchStr;  // Exact match
```

## Files Changed

1. `src/components/Animals.tsx` - Line 265
2. `src/components/AnimalsCompact.tsx` - Line 206

## Testing

1. Go to "Gyvūnai" tab
2. Enter collar number in "Ieškoti pagal kaklo numerį" field
3. Try searching for:
   - `101` - should only match collar 101 (not 1017, 2101, etc.)
   - `1017` - should only match collar 1017
   - `17` - should only match collar 17 (not 1017, 170, etc.)

## Impact

- **Risk**: NONE - simple search logic change
- **Reversible**: YES - easy to revert
- **Affects**: Only the collar number search field in Gyvūnai tab
- **Does NOT affect**: General search field (tag_no, holder name, etc.)

## Notes

- The general search field still uses partial matching (`.includes()`) - this is correct
- Only the collar number search uses exact matching now
- This matches user expectations for numeric ID searches
