# Deployment Checklist - Darbuotojai Enhancement

## 📋 Pre-Deployment Checklist

### ✅ Code Changes
- [x] Database migration created (`20260304000001_enhance_manual_time_entries.sql`)
- [x] Component updated (`ManualEntryView.tsx`)
- [x] TypeScript interfaces updated
- [x] Build successful (no errors)
- [x] Linter passed (no warnings)
- [x] Documentation created

### ✅ Testing
- [x] TypeScript compilation successful
- [x] No linter errors
- [x] Build completes successfully
- [ ] Manual testing in development (requires Docker/Supabase running)

---

## 🚀 Deployment Steps

### Step 1: Backup Database
```bash
# Create a backup of your current database
npx supabase db dump -f backup_before_enhancement.sql
```

### Step 2: Start Supabase (if not running)
```bash
# Make sure Docker Desktop is running
# Then start Supabase
cd supabase
npx supabase start
```

### Step 3: Apply Migration
```bash
# Option A: Reset database (development only!)
cd supabase
npx supabase db reset

# Option B: Apply migration only (production)
cd supabase
npx supabase db push
```

### Step 4: Verify Migration
```sql
-- Check that measurement_units table exists
SELECT * FROM measurement_units;
-- Should return 10 default units

-- Check that manual_time_entries has new columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'manual_time_entries';
-- Should show: worker_type, lunch_type, work_description, 
--              measurement_value, measurement_unit_id
```

### Step 5: Test Features
1. Open the application
2. Navigate to Darbuotojų grafikai
3. Click "Surašyti iš lapų"
4. Test each feature:
   - [ ] Auto-formatting time inputs (type 4 digits)
   - [ ] Auto-advancing between fields
   - [ ] Worker type selection
   - [ ] Lunch type selection
   - [ ] Work description field (for Darbuotojas)
   - [ ] Measurement fields (for Vairuotojas/Traktorininkas)
   - [ ] Bulk fill with new options
   - [ ] Copy from previous day
   - [ ] Save entries
   - [ ] Review tab shows all fields
   - [ ] Edit entries in review tab
   - [ ] Measurement units tab
   - [ ] Add new measurement unit
   - [ ] Delete measurement unit

### Step 6: Deploy to Production
```bash
# Build the application
npm run build

# Deploy to your hosting service
# (depends on your deployment setup)
```

---

## 🧪 Testing Scenarios

### Test 1: Regular Worker Entry
```
1. Select worker type: Darbuotojas
2. Type start time: 0800 (should format to 08:00)
3. Type end time: 1700 (should format to 17:00)
4. Select lunch: Pilni pietūs
5. Enter work description: "Gyvulių šėrimas"
6. Verify hours: Should show 8.0h (9h - 1h)
7. Save and verify in review tab
```

### Test 2: Driver Entry
```
1. Select worker type: Vairuotojas
2. Type start time: 0800
3. Type end time: 1600
4. Select lunch: Pusė pietų
5. Enter measurement: 150
6. Select unit: km
7. Verify hours: Should show 7.5h (8h - 0.5h)
8. Save and verify in review tab
```

### Test 3: Tractor Operator Entry
```
1. Select worker type: Traktorininkas
2. Type start time: 0700
3. Type end time: 1900
4. Select lunch: Pilni pietūs
5. Enter measurement: 25
6. Select unit: ha
7. Verify hours: Should show 11h (12h - 1h)
8. Save and verify in review tab
```

### Test 4: Bulk Fill
```
1. Click "Užpildyti visas dienas"
2. Enter start: 0800
3. Enter end: 1700
4. Select type: Darbuotojas
5. Select lunch: Pilni pietūs
6. Click Pritaikyti
7. Verify all weekdays are filled
8. Verify weekends are skipped (if checkbox checked)
```

### Test 5: Measurement Units Management
```
1. Go to "Matavimo vienetai" tab
2. Select worker type: Vairuotojas
3. Enter name: "Kubas"
4. Enter abbreviation: "m³"
5. Click Pridėti
6. Verify unit appears in Vairuotojas column
7. Go back to input tab
8. Select worker type: Vairuotojas
9. Verify "m³" appears in unit dropdown
10. Delete the unit
11. Verify it's removed from dropdown
```

### Test 6: Auto-Advancing
```
1. Focus on first day's start time
2. Type: 0810 (4 digits)
3. Verify cursor moves to end time automatically
4. Type: 1853 (4 digits)
5. Verify cursor moves to next day's start time
6. Continue typing without touching mouse/tab
```

### Test 7: Copy Function
```
1. Fill in first day completely:
   - Times: 08:00 - 17:00
   - Type: Vairuotojas
   - Lunch: Pusė
   - Measurement: 120 km
2. Click copy icon on second day
3. Verify ALL fields are copied:
   - Start time: 08:00
   - End time: 17:00
   - Worker type: Vairuotojas
   - Lunch: Pusė
   - Measurement: 120 km
```

### Test 8: Edit in Review Tab
```
1. Save some entries
2. Go to Peržiūra tab
3. Click edit icon
4. Change worker type
5. Change lunch type
6. Change work description/measurement
7. Save changes
8. Verify changes are persisted
9. Verify hours recalculated correctly
```

---

## 🐛 Troubleshooting

### Issue: Migration fails
**Solution:**
```bash
# Check Supabase status
npx supabase status

# Check Docker is running
docker ps

# View migration logs
npx supabase db reset --debug
```

### Issue: Auto-formatting not working
**Check:**
- Browser console for JavaScript errors
- Input field has correct ref assigned
- handleTimeInput function is called

### Issue: Hours calculation wrong
**Check:**
- Lunch type is selected correctly
- calculateHours function receives lunch_type parameter
- Database trigger is working (check hours_worked column)

### Issue: Measurement units not showing
**Check:**
- Migration created measurement_units table
- Default units were inserted
- loadMeasurementUnits function is called on mount
- work_location filter is correct

### Issue: Auto-advancing not working
**Check:**
- timeInputRefs are set correctly
- handleTimeInput detects 4 digits
- setTimeout is not blocked
- Next field exists and is focusable

---

## 📊 Post-Deployment Verification

### Database Checks
```sql
-- Verify measurement_units table
SELECT COUNT(*) FROM measurement_units WHERE is_active = true;
-- Should return 10 (default units)

-- Verify manual_time_entries structure
\d manual_time_entries
-- Should show all new columns

-- Test hours calculation
SELECT 
  start_time, 
  end_time, 
  lunch_type, 
  hours_worked 
FROM manual_time_entries 
LIMIT 5;
-- Verify hours_worked is calculated correctly
```

### UI Checks
- [ ] All three tabs visible (Įvesti, Peržiūra, Matavimo vienetai)
- [ ] Input table has 8 columns
- [ ] Review table has 8 columns
- [ ] Measurement units tab shows two columns
- [ ] Default units are visible
- [ ] Bulk fill dialog has 4 fields
- [ ] Worker type dropdown has 3 options
- [ ] Lunch type dropdown has 3 options

### Functionality Checks
- [ ] Time inputs auto-format after 4 digits
- [ ] Cursor auto-advances after 4 digits
- [ ] Hours calculate with lunch deduction
- [ ] Work description shows for Darbuotojas
- [ ] Measurement fields show for Vairuotojas/Traktorininkas
- [ ] Measurement units can be added
- [ ] Measurement units can be deleted
- [ ] Bulk fill applies all options
- [ ] Copy copies all fields
- [ ] Edit mode shows all fields
- [ ] Save persists all data

---

## 📝 User Training

### Key Points to Communicate
1. **Time Entry is Faster:**
   - Just type 4 digits (no colon needed)
   - Cursor jumps automatically

2. **Lunch is Tracked:**
   - Select lunch type for each day
   - Hours are automatically adjusted

3. **Different Worker Types:**
   - Darbuotojas → Enter work description
   - Vairuotojas → Enter km/measurements
   - Traktorininkas → Enter hectares/measurements

4. **Custom Units:**
   - Can create own measurement units
   - Available in "Matavimo vienetai" tab

### Training Materials
- [ ] Quick Start Guide (QUICK_START_DARBUOTOJAI.md)
- [ ] Before/After Comparison (BEFORE_AFTER_COMPARISON.md)
- [ ] Full Documentation (DARBUOTOJAI_ENHANCEMENT.md)

---

## 🎯 Success Criteria

### Must Have (Critical)
- [x] Database migration applied successfully
- [x] No build errors
- [x] No linter errors
- [ ] All features working in development
- [ ] All test scenarios pass

### Should Have (Important)
- [ ] User training completed
- [ ] Documentation reviewed by users
- [ ] Backup created before deployment
- [ ] Rollback plan prepared

### Nice to Have (Optional)
- [ ] Performance metrics collected
- [ ] User feedback gathered
- [ ] Analytics tracking added

---

## 🔄 Rollback Plan

If something goes wrong:

### Step 1: Restore Database
```bash
# Restore from backup
psql -U postgres -d your_database < backup_before_enhancement.sql
```

### Step 2: Revert Code
```bash
# Revert to previous commit
git revert HEAD
git push
```

### Step 3: Redeploy
```bash
npm run build
# Deploy previous version
```

---

## 📞 Support

### If Issues Occur
1. Check troubleshooting section above
2. Review error logs
3. Check documentation files
4. Contact system administrator

### Documentation Files
- `DARBUOTOJAI_ENHANCEMENT.md` - Full technical docs
- `QUICK_START_DARBUOTOJAI.md` - User guide
- `BEFORE_AFTER_COMPARISON.md` - Visual comparison
- `IMPLEMENTATION_SUMMARY.md` - Implementation details
- `DEPLOYMENT_CHECKLIST.md` - This file

---

## ✅ Final Checklist

Before marking deployment complete:
- [ ] Database migration applied
- [ ] All tests passed
- [ ] Users trained
- [ ] Documentation distributed
- [ ] Backup created
- [ ] Rollback plan ready
- [ ] Support team notified
- [ ] Monitoring in place

---

**Ready to deploy? LET'S GO! 🚀**
