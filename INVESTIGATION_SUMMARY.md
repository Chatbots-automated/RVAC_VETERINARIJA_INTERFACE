# Investigation Summary: Vaccine Withdrawal Periods (Karencija)

## Current State Analysis

### 1. Product Categories
**Database Enum (product_category):**
- medicines
- prevention
- reproduction
- treatment_materials
- hygiene
- biocide
- technical
- svirkstukai
- bolusas
- **vakcina** ✅

**Frontend Type (src/lib/types.ts):**
```typescript
export type ProductCategory = 'medicines' | 'prevention' | 'ovules' | 'vakcina' | 'reproduction' | 'treatment_materials' | 'hygiene' | 'biocide' | 'technical' | 'svirkstukai' | 'bolusas';
```

**Issue:** 'ovules' exists in frontend but NOT in database enum!

### 2. Withdrawal Period System

#### Current Implementation:
**Products Table Fields:**
- `withdrawal_days_meat` - Used for medicines, svirkstukai, prevention, ovules
- `withdrawal_days_milk` - Used for medicines, svirkstukai, prevention, ovules
- Route-specific fields (iv, im, sc, iu, imm, pos) for meat and milk

**Treatments Table Fields:**
- `withdrawal_until_milk` - Calculated date
- `withdrawal_until_meat` - Calculated date

**Calculation Function:**
`calculate_withdrawal_dates(p_treatment_id uuid)` - Automatically calculates withdrawal dates based on:
- Products used in treatment
- Administration routes
- Course durations

**Triggers:**
- `auto_calculate_withdrawal_on_usage` - Fires when usage_items inserted/updated
- `auto_calculate_withdrawal_on_course` - Fires when treatment_courses inserted/updated

### 3. Vaccinations System

**Vaccinations Table:**
```sql
CREATE TABLE vaccinations (
    id uuid PRIMARY KEY,
    farm_id uuid NOT NULL,
    animal_id uuid,
    product_id uuid NOT NULL,
    batch_id uuid,
    vaccination_date date NOT NULL,
    next_booster_date date,
    dose_number integer DEFAULT 1,
    dose_amount numeric NOT NULL,
    unit unit NOT NULL,
    notes text,
    administered_by text,
    ...
)
```

**Current Flow:**
1. Vaccination record created
2. Trigger `create_usage_from_vaccination` creates usage_item with `purpose='vaccination'`
3. **NO withdrawal calculation happens** ❌

### 4. Where Vaccines Are Used

#### A. Animal Detail Sidebar - Naujas Vizitas
- `VisitCreateModal` component
- Procedure: "Vakcina"
- Creates vaccination records
- **Does NOT calculate withdrawal periods** ❌

#### B. Bulk Treatment (Masinis Gydymas)
- `BulkTreatment` component
- Handles vaccines with category 'vakcina'
- Creates vaccination records
- **Does NOT calculate withdrawal periods** ❌

#### C. Vaccinations Tab
- Displays vaccination history
- Shows dose info, dates, notes
- **No withdrawal period display** ❌

## Required Changes

### 1. Database Schema
✅ Add 'ovules' to product_category enum
✅ Vaccines already support withdrawal fields (no schema change needed)

### 2. Product Creation/Editing
✅ Show withdrawal fields for 'vakcina' category (currently only for medicines, svirkstukai, prevention, ovules)

Files to update:
- `src/components/Products.tsx` - Lines 136-137, 392
- `src/components/WarehouseStock.tsx` - Lines 485-486, 1873
- `src/components/ReceiveStock.tsx` - Lines 431-432, 1784

### 3. Withdrawal Calculation for Vaccines
Need to modify:
- `calculate_withdrawal_dates()` function to handle vaccination_id
- Create new trigger or modify existing to calculate withdrawal for vaccinations
- Link vaccinations to treatments table OR create separate withdrawal tracking

### 4. UI Updates
- Show withdrawal periods in Vaccinations tab
- Show withdrawal periods in Bulk Treatment for vaccines
- Show withdrawal status when vaccine has active withdrawal period

## Implementation Plan

### Phase 1: Fix Database Enum
1. Add 'ovules' to product_category enum
2. Verify no breaking changes

### Phase 2: Enable Withdrawal Fields for Vaccines
1. Update Products.tsx to show withdrawal fields for 'vakcina'
2. Update WarehouseStock.tsx
3. Update ReceiveStock.tsx

### Phase 3: Withdrawal Calculation for Vaccines
**Option A: Link to Treatments**
- Create treatment record when vaccine with withdrawal is used
- Use existing withdrawal calculation

**Option B: Separate Vaccine Withdrawal Tracking**
- Add withdrawal_until_milk, withdrawal_until_meat to vaccinations table
- Create separate calculation function
- Update vw_withdrawal_status view

**Recommendation: Option A** - Reuse existing infrastructure

### Phase 4: UI Display
1. Update Vaccinations tab to show withdrawal status
2. Update Bulk Treatment to show withdrawal info
3. Update Animal Detail Sidebar overview to include vaccine withdrawals
