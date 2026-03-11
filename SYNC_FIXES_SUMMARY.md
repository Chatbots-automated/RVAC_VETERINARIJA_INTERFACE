# Synchronization Protocol Fixes

## Issues Fixed

### Issue 1: Telycaites Can't Start New Synchronization After Completion

**Problem**: When a telycaite (heifer) has a **Completed** synchronization protocol, the "Pradėti naują sinchronizacijos protokolą" button doesn't appear, preventing them from starting a new protocol.

**Root Cause**: The component only showed the "start new" button for **Cancelled** syncs, not **Completed** ones.

```typescript
// OLD CODE (line 711)
{isCancelled && (
  <button>Pradėti naują sinchronizacijos protokolą</button>
)}
```

**Fix**: Allow starting new protocols for both Cancelled AND Completed syncs.

```typescript
// NEW CODE
{(isCancelled || activeSync.status === 'Completed') && (
  <button disabled={isApsek}>Pradėti naują sinchronizacijos protokolą</button>
)}
```

**File Changed**: `src/components/SynchronizationProtocol.tsx`

---

### Issue 2: Synchronization Doesn't Split Across Multiple Batches

**Problem**: When completing a synchronization step that needs 6ml, if the selected batch only has 5ml left, the system throws an error instead of taking 5ml from that batch and 1ml from the next batch (FIFO).

**Current Behavior**:
```
Batch A: 5ml left
Batch B: 10ml left
User needs: 6ml
Result: ❌ ERROR - "Insufficient stock in batch"
```

**Desired Behavior** (like treatments):
```
Batch A: 5ml left
Batch B: 10ml left
User needs: 6ml
Result: ✅ Take 5ml from Batch A, 1ml from Batch B
```

**Root Cause**: The `deduct_sync_step_medication()` trigger function only deducts from a single batch (the one specified in `batch_id`).

**Fix**: Updated the function to:
1. Check total available stock across all batches
2. Use FIFO (First In First Out) - oldest expiry date first
3. Split the dosage across multiple batches if needed
4. Create `usage_items` records for tracking (like treatments do)

**Migration**: `supabase/migrations/20260213000004_fix_sync_batch_splitting.sql`

---

## How to Apply

### Step 1: Frontend Fix (Already Applied)
The telycaite button fix is already applied in `SynchronizationProtocol.tsx`.

### Step 2: Database Fix (Batch Splitting)

**Via Supabase Dashboard:**
1. Go to SQL Editor
2. Run: `supabase/migrations/20260213000004_fix_sync_batch_splitting.sql`

**Via Supabase CLI:**
```bash
supabase db push
```

---

## Verification

### Test 1: Telycaite Button
1. Go to a telycaite with a Completed sync (e.g., LT000044232865)
2. Click "Naujas vizitas" → "Sinchronizacijos protokolas"
3. Should now see "Pradėti naują sinchronizacijos protokolą" button
4. Button should only be disabled if GEA status is APSĖK

### Test 2: Batch Splitting
1. Find a product used in sync (e.g., Enzaprost)
2. Create batches: Batch A with 5ml, Batch B with 10ml
3. Start a sync protocol that needs 6ml
4. Complete the step
5. Should succeed and take 5ml from Batch A, 1ml from Batch B
6. Check `usage_items` table - should see 2 records

---

## Technical Details

### Batch Splitting Logic

The new function:
1. Calculates total available stock across ALL batches
2. Validates sufficient stock exists
3. Loops through batches in FIFO order (oldest expiry first)
4. Takes what's available from each batch
5. Creates `usage_items` for each batch used
6. Continues until full dosage is fulfilled

This matches the behavior of:
- Treatment medications (`process_visit_medications()`)
- Vaccination medications
- Prevention medications

### Usage Items Tracking

The new function creates `usage_items` records for each batch used, which:
- Tracks exactly which batches were used
- Enables proper stock reporting
- Maintains audit trail
- Consistent with treatment system

---

## Files Created

1. **Frontend Fix**:
   - Modified: `src/components/SynchronizationProtocol.tsx`

2. **Database Migration**:
   - `supabase/migrations/20260213000004_fix_sync_batch_splitting.sql` - The fix
   - `supabase/migrations/20260213000005_revert_sync_batch_splitting.sql` - Revert if needed

3. **Diagnostic Scripts**:
   - `debug-telycaite-button.sql` - Debug why button is greyed out
   - `check-telycaite-status.sql` - Check telycaite GEA statuses

4. **Documentation**:
   - This file (`SYNC_FIXES_SUMMARY.md`)

---

## Risk Assessment

### Frontend Change (Telycaite Button)
- **Risk**: VERY LOW
- **Impact**: Only affects UI display logic
- **Reversible**: YES - simple code change
- **Testing**: Manual UI testing sufficient

### Database Change (Batch Splitting)
- **Risk**: LOW-MEDIUM
- **Impact**: Changes how stock is deducted for synchronization
- **Reversible**: YES - revert migration provided
- **Testing**: Should test with real data before production

**Concerns**:
- The function now creates `usage_items` which might affect reports
- FIFO logic must match treatment system behavior
- Need to verify `treatment_id` can be NULL in `usage_items`

---

## To Revert

### Frontend
```typescript
// Change back to:
{isCancelled && (
  <button>Pradėti naują sinchronizacijos protokolą</button>
)}
```

### Database
Run in Supabase SQL Editor:
```sql
-- Copy and run: supabase/migrations/20260213000005_revert_sync_batch_splitting.sql
```
