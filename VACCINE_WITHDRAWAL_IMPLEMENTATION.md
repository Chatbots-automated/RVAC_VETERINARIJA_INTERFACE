# Vaccine Withdrawal Period Implementation

## Summary of Changes

This implementation adds full withdrawal period (karencija) support for vaccines, fixing the "ovules" enum error and enabling proper tracking of vaccine withdrawal periods for both milk and meat.

## Changes Made

### 1. Database Migration (`supabase/migrations/20260409000001_add_ovules_and_vaccine_withdrawal.sql`)

#### Fixed Enum Issue
- **Added 'ovules' to `product_category` enum** - This value existed in the frontend TypeScript but was missing from the database, causing the error you saw.

#### Vaccination Withdrawal Fields
- Added `withdrawal_until_milk` column to `vaccinations` table
- Added `withdrawal_until_meat` column to `vaccinations` table

#### Automatic Withdrawal Calculation
- **New Function**: `calculate_vaccination_withdrawal_dates(p_vaccination_id uuid)`
  - Reads product withdrawal days (milk & meat)
  - Calculates end dates based on vaccination date
  - Updates vaccination record automatically

- **New Trigger**: `auto_calculate_vaccination_withdrawal`
  - Fires when vaccination is inserted or updated
  - Automatically calculates withdrawal periods
  - No manual intervention needed

#### Updated Withdrawal Status View
- **Enhanced `vw_withdrawal_status` view** to include both treatments AND vaccinations
- Combines withdrawal periods from:
  - Treatments (existing)
  - Vaccinations (new)
- Takes the maximum (latest) withdrawal date from both sources
- Used throughout the system to check if animal has active withdrawal period

#### Performance Indexes
- Added indexes on `vaccinations.withdrawal_until_milk`
- Added indexes on `vaccinations.withdrawal_until_meat`
- Improves query performance for withdrawal reports

#### Backfill
- Automatically calculates withdrawal dates for all existing vaccinations
- Runs once during migration

### 2. Frontend Changes

#### Product Management - Withdrawal Fields Now Show for Vaccines

**Files Updated:**
- `src/components/Products.tsx` (3 locations)
- `src/components/WarehouseStock.tsx` (3 locations)
- `src/components/ReceiveStock.tsx` (3 locations)

**What Changed:**
```typescript
// OLD - vaccines not included
['medicines', 'svirkstukai', 'prevention', 'ovules']

// NEW - vaccines included
['medicines', 'svirkstukai', 'prevention', 'ovules', 'vakcina']
```

**Result:**
When creating or editing a product with category "Vakcina", you now see:
- Karencija pienui (dienomis) - Milk withdrawal days
- Karencija mėsai (dienomis) - Meat withdrawal days

#### Vaccination Display - Shows Withdrawal Information

**File Updated:**
- `src/components/AnimalDetailSidebar.tsx`

**Changes:**
1. Updated `Vaccination` interface to include:
   - `withdrawal_until_milk: string | null`
   - `withdrawal_until_meat: string | null`

2. Enhanced vaccination card display to show withdrawal period when active:
   - Amber warning box with alert icon
   - Shows milk withdrawal end date (if applicable)
   - Shows meat withdrawal end date (if applicable)
   - Visual indicator (⚠️) if withdrawal is currently active
   - Gray text if withdrawal has already passed

**Visual Example:**
```
┌─────────────────────────────────────┐
│ 💉 Vakcina Pavadinimas              │
│ 📅 2026-04-01                       │
│                                     │
│ ⚠️ Karencijos laikotarpis           │
│ 🥛 Pienas: 2026-04-15 ⚠️            │
│ 🥩 Mėsa: 2026-04-22 ⚠️              │
└─────────────────────────────────────┘
```

## How It Works

### When Creating a Vaccine Product

1. User selects category "Vakcina"
2. Form shows withdrawal period fields:
   - Karencija pienui (dienomis)
   - Karencija mėsai (dienomis)
3. User enters days (e.g., 14 days for milk, 21 days for meat)
4. Product saved with withdrawal information

### When Administering a Vaccine

#### In "Naujas Vizitas" (Animal Detail Sidebar)
1. User creates visit with "Vakcina" procedure
2. Selects vaccine product and batch
3. Enters dose amount
4. Saves visit

**Behind the scenes:**
1. Vaccination record created
2. Trigger fires: `auto_calculate_vaccination_withdrawal`
3. Function reads product's withdrawal days
4. Calculates: `vaccination_date + withdrawal_days`
5. Updates vaccination record with end dates
6. `vw_withdrawal_status` view automatically includes this data

#### In "Masinis Gydymas" (Bulk Treatment)
1. User selects multiple animals
2. Adds vaccine with category 'vakcina'
3. Enters dose for each animal
4. Submits

**Behind the scenes:**
- Same automatic calculation happens for each animal
- All vaccinations get withdrawal periods calculated
- Withdrawal status updated for all animals

### Checking Withdrawal Status

The system now checks withdrawal from BOTH sources:

**Treatments:**
- Medicines (vaistai)
- Svirkstukai
- Prevention products
- Ovules

**Vaccinations:**
- Vaccines with withdrawal periods

**Combined View:**
- `vw_withdrawal_status` shows the latest (maximum) withdrawal date
- If treatment says milk until 2026-04-10
- And vaccine says milk until 2026-04-15
- System shows: milk withdrawal until 2026-04-15 (takes the later date)

## Where Withdrawal Information Appears

### 1. Animal Detail Sidebar
- **Overview Tab**: Shows overall withdrawal status (from combined view)
- **Vaccinations Tab**: Shows withdrawal for each individual vaccine
- **Treatments Tab**: Shows withdrawal for each treatment (existing)

### 2. Reports
- Withdrawal reports now include vaccines
- "Gydomų gyvūnų žurnalas" includes vaccine withdrawals
- Export functions include vaccine data

### 3. Dashboard
- Withdrawal warnings include vaccines
- Animal counts with active withdrawal include vaccine periods

## Testing Checklist

### Database Migration
- [ ] Run migration in Supabase Dashboard SQL Editor
- [ ] Verify 'ovules' added to enum: `SELECT unnest(enum_range(NULL::product_category));`
- [ ] Verify vaccination columns added: `\d vaccinations`
- [ ] Check trigger exists: `SELECT * FROM pg_trigger WHERE tgname = 'auto_calculate_vaccination_withdrawal';`
- [ ] Verify view updated: `SELECT * FROM vw_withdrawal_status LIMIT 5;`

### Product Creation
- [ ] Create new product with category "Vakcina"
- [ ] Verify withdrawal fields appear
- [ ] Enter withdrawal days (e.g., milk: 14, meat: 21)
- [ ] Save and verify in database

### Vaccination Administration
- [ ] Open animal detail sidebar
- [ ] Create "Naujas vizitas" with "Vakcina" procedure
- [ ] Select vaccine with withdrawal periods
- [ ] Complete and save
- [ ] Check vaccinations tab - should show withdrawal info
- [ ] Verify withdrawal dates calculated correctly

### Bulk Treatment
- [ ] Go to "Masinis gydymas"
- [ ] Select multiple animals
- [ ] Add vaccine with withdrawal
- [ ] Submit
- [ ] Check each animal's vaccination tab
- [ ] Verify withdrawal calculated for all

### Withdrawal Status
- [ ] Check animal overview tab
- [ ] Should show "Karencijos Laikotarpis" if vaccine has active withdrawal
- [ ] Verify dates match vaccination + withdrawal days
- [ ] Check that it combines with treatment withdrawals (shows latest date)

## Migration Instructions

### Step 1: Apply Database Migration
```sql
-- In Supabase Dashboard > SQL Editor
-- Paste contents of: supabase/migrations/20260409000001_add_ovules_and_vaccine_withdrawal.sql
-- Click "Run"
```

### Step 2: Verify Migration
```sql
-- Check enum
SELECT unnest(enum_range(NULL::product_category));
-- Should include 'ovules'

-- Check vaccination columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'vaccinations' 
AND column_name LIKE 'withdrawal%';
-- Should show withdrawal_until_milk and withdrawal_until_meat

-- Check trigger
SELECT tgname FROM pg_trigger WHERE tgname = 'auto_calculate_vaccination_withdrawal';
-- Should return 1 row
```

### Step 3: Deploy Frontend
The frontend changes are already made in the codebase. Just deploy/refresh.

### Step 4: Test
Follow the testing checklist above.

## Troubleshooting

### "ovules" enum error persists
- Verify migration ran successfully
- Check: `SELECT unnest(enum_range(NULL::product_category));`
- If 'ovules' missing, run just the enum part of migration again

### Withdrawal not calculating
- Check trigger exists: `SELECT * FROM pg_trigger WHERE tgname = 'auto_calculate_vaccination_withdrawal';`
- Check function exists: `SELECT * FROM pg_proc WHERE proname = 'calculate_vaccination_withdrawal_dates';`
- Manually test: `SELECT calculate_vaccination_withdrawal_dates('vaccination-id-here');`

### Withdrawal not showing in UI
- Verify vaccination record has withdrawal dates: `SELECT id, withdrawal_until_milk, withdrawal_until_meat FROM vaccinations WHERE id = 'xxx';`
- Check browser console for errors
- Verify frontend code deployed

### Old vaccinations don't have withdrawal
- Run backfill manually:
```sql
SELECT calculate_vaccination_withdrawal_dates(id)
FROM vaccinations
WHERE vaccination_date IS NOT NULL 
AND product_id IS NOT NULL
AND (withdrawal_until_milk IS NULL OR withdrawal_until_meat IS NULL);
```

## Notes

- Withdrawal calculation is automatic - no manual intervention needed
- System uses FIFO (First In, First Out) for batch selection
- Withdrawal periods are product-specific, not batch-specific
- The system takes the maximum (latest) withdrawal date when multiple sources exist
- All existing vaccinations are backfilled during migration
- The 'ovules' category fix resolves the enum error you were seeing
