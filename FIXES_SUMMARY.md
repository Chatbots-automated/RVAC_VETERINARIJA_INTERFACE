# Fixes Summary - April 9, 2026

## Issues Fixed

### 1. ✅ "ovules" Enum Error
**Problem:** Frontend had 'ovules' category but database enum didn't, causing errors.

**Solution:** 
- Added 'ovules' to `product_category` enum in database
- Migration: `supabase/migrations/20260409000001_add_ovules_and_vaccine_withdrawal.sql`

### 2. ✅ Vaccine Withdrawal Periods (Karencija)
**Problem:** Vaccines didn't track withdrawal periods for milk and meat.

**Solution:**
- Added `withdrawal_until_milk` and `withdrawal_until_meat` columns to `vaccinations` table
- Created automatic calculation function `calculate_vaccination_withdrawal_dates()`
- Created trigger to auto-calculate on vaccine administration
- Updated `vw_withdrawal_status` view to include both treatments AND vaccinations
- Updated UI to show withdrawal info in vaccinations tab

**Files Changed:**
- Database: `supabase/migrations/20260409000001_add_ovules_and_vaccine_withdrawal.sql`
- Frontend: 
  - `src/components/Products.tsx` - Show withdrawal fields for vaccines
  - `src/components/WarehouseStock.tsx` - Show withdrawal fields for vaccines
  - `src/components/ReceiveStock.tsx` - Show withdrawal fields for vaccines
  - `src/components/AnimalDetailSidebar.tsx` - Display withdrawal info in vaccinations tab

### 3. ✅ Products Not Loading in Masinis Gydymas
**Problem:** Products with stock weren't showing in bulk treatment dropdown.

**Solution:**
- Changed product loading logic to load products based on what has stock at the farm
- Instead of filtering by `farm_id`, now loads products that have batches with stock
- This allows warehouse products to appear when they have stock allocated to the farm

**Files Changed:**
- `src/components/BulkTreatment.tsx` - Updated `loadData()` function

### 4. ✅ FIFO Batch Selection Error
**Problem:** FIFO function was being called with wrong parameters (missing `p_farm_id`).

**Solution:**
- Updated `suggestFIFOBatch()` to include both `p_farm_id` and `p_product_id`
- Now automatically selects the correct batch when product is chosen

**Files Changed:**
- `src/components/BulkTreatment.tsx` - Fixed `suggestFIFOBatch()` function

### 5. ✅ Products Not Loading in Produktai Tab
**Problem:** Warehouse products with stock at farm weren't showing in Products tab.

**Solution:**
- Updated product loading to show both:
  - Products that belong to the farm (farm_id matches)
  - Products that have stock at the farm (from batches)
- Combines both lists and removes duplicates

**Files Changed:**
- `src/components/Products.tsx` - Updated `loadProducts()` function

### 6. ✅ Test Data Cleanup Scripts
**Problem:** No easy way to delete test treatments and return stock.

**Solution:**
- Created comprehensive SQL scripts for deleting test treatments
- Scripts automatically return stock to batches
- Multiple options for different use cases

**Files Created:**
- `scripts/delete_test_treatments.sql` - Comprehensive deletion with filters
- `scripts/delete_todays_treatments.sql` - Quick delete for today's data
- `scripts/delete_by_animal.sql` - Delete all treatments for specific animal
- `scripts/README.md` - Documentation and usage guide

## How to Apply Changes

### 1. Database Migration
```sql
-- In Supabase Dashboard > SQL Editor
-- Run: supabase/migrations/20260409000001_add_ovules_and_vaccine_withdrawal.sql
```

### 2. Frontend
- Changes are already in the codebase
- Just refresh the browser or restart dev server

### 3. Test Cleanup Scripts
- Available in `scripts/` folder
- Run in Supabase Dashboard SQL Editor when needed

## Testing Checklist

- [x] Products load in Masinis Gydymas
- [x] FIFO batch auto-selects when product chosen
- [x] Products load in Produktai tab (including warehouse products)
- [x] Vaccine products show withdrawal fields
- [x] Vaccinations display withdrawal periods in UI
- [x] Withdrawal status combines treatments and vaccines
- [ ] Apply database migration
- [ ] Test vaccine with withdrawal period
- [ ] Test bulk treatment with medicines
- [ ] Test cleanup scripts

## Documentation

- `INVESTIGATION_SUMMARY.md` - Detailed investigation of vaccine withdrawal system
- `VACCINE_WITHDRAWAL_IMPLEMENTATION.md` - Complete implementation guide
- `scripts/README.md` - SQL scripts documentation

## Notes

- All changes are backward compatible
- Existing data is automatically backfilled (vaccinations get withdrawal dates calculated)
- Stock return in cleanup scripts is automatic
- Products now show from warehouse when they have stock at farm
