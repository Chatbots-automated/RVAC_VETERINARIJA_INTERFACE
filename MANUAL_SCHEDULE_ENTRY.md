# Manual Schedule Entry from Paper Timesheets

## Overview
Added "Surašyti iš lapų" (Fill from Papers) feature to manually enter worker schedules based on paper timesheets collected at the end of each month.

## Problem Solved
- Workers fill out paper timesheets during the month
- Papers are collected at month-end
- Secretary needs to manually enter all data into the system
- Need to calculate total hours per worker, per week, and per month

## New Feature: "Surašyti iš lapų"

### Access
**Location:** Darbuotojų grafikai module → "Surašyti iš lapų" button (top right)

Available in both:
- Technikos kiemas (Warehouse workers)
- Ferma (Farm workers)

### How It Works

#### 1. **Open Manual Entry**
- Click "Surašyti iš lapų" button
- Modal opens with empty entry form

#### 2. **Select Month**
- Choose the month you're entering data for
- Month selector at the top

#### 3. **Add Entries**
- Click "Pridėti įrašą" (Add Entry)
- Each entry includes:
  - **Darbuotojas** (Worker) - Dropdown
  - **Data** (Date) - Date picker
  - **Pradžia** (Start Time) - Time input
  - **Pabaiga** (End Time) - Time input
  - **Pertrauka** (Break in minutes) - Number input
  - **Valandos** (Hours) - Auto-calculated
  - **Pastabos** (Notes) - Optional text

#### 4. **Auto-Calculation**
- Hours automatically calculated: `(End - Start - Break) / 60`
- Shows in blue badge next to each entry

#### 5. **Summary Statistics**
Real-time summary shows:
- **Hours per worker** (for the month)
- **Total hours** (all workers, all entries)
- **Entry count**

#### 6. **Save**
- Click "Išsaugoti grafikus" button
- All entries saved as work schedules
- Appears in the regular calendar view

## Features

### Automatic Calculations ✅
- **Work hours per entry**: `(end_time - start_time - break_minutes) / 60`
- **Total per worker per month**: Sum of all entries for that worker
- **Total per month**: Sum of all entries
- **Total per week**: Filtered by week dates

### Data Validation
- All fields required except notes
- Break time defaults to 60 minutes (1 hour)
- Default work hours: 08:00 - 17:00

### User-Friendly Design
- **Color-coded hours**: Blue badges for easy reading
- **Grid layout**: All info visible at once
- **Quick entry**: Tab through fields
- **Bulk operations**: Add multiple entries before saving

## UI Components

### Main Modal
- **Header**: Title, description, close button
- **Month Selector**: Choose which month to enter
- **Add Button**: Green "Pridėti įrašą" button
- **Entry List**: Grid of all entries
- **Summary**: Blue box with statistics
- **Footer**: Cancel and Save buttons

### Entry Row (12-column grid)
1. Worker dropdown (2 cols)
2. Date picker (2 cols)
3. Start time (2 cols)
4. End time (2 cols)
5. Break minutes (1 col)
6. Calculated hours (1 col) - Blue badge
7. Notes (1 col)
8. Delete button (1 col)

### Summary Box
- **Left**: Hours per worker
- **Middle**: Total month hours (large number)
- **Right**: Entry count

## Example Workflow

### Scenario: End of January
Secretary has paper timesheets from all workers for January.

**Steps:**
1. Open "Darbuotojų grafikai"
2. Click "Surašyti iš lapų"
3. Select "2026-01" (January 2026)
4. Add entries from papers:
   - Jonas: 2026-01-02, 07:00-16:00, 60min break = 8h
   - Jonas: 2026-01-03, 07:00-16:00, 60min break = 8h
   - Petras: 2026-01-02, 08:00-17:00, 60min break = 8h
   - ...continue for all days and workers
5. Summary shows:
   - Jonas: 176h (22 days × 8h)
   - Petras: 168h (21 days × 8h)
   - Total: 344h
6. Click "Išsaugoti grafikus (44)"
7. All schedules appear in calendar

## Benefits

### For Secretary
✅ **Faster data entry** - All fields in one view
✅ **Auto-calculation** - No manual math needed
✅ **Error prevention** - See hours immediately
✅ **Bulk entry** - Add many before saving
✅ **Summary validation** - Check totals before saving

### For Management
✅ **Accurate records** - Based on actual paper timesheets
✅ **Hour tracking** - See totals per worker
✅ **Compliance** - Proper documentation
✅ **Reporting** - Data available for reports

## Technical Details

### Data Structure
```typescript
{
  worker_id: string,
  date: string,
  start_time: string,  // "08:00"
  end_time: string,    // "17:00"
  break_minutes: number,
  notes: string
}
```

### Saved As
```sql
INSERT INTO worker_schedules (
  worker_id,
  date,
  shift_start,
  shift_end,
  schedule_type,
  notes,
  work_location
)
```

### Calculations
```typescript
// Hours per entry
hours = (endMinutes - startMinutes - breakMinutes) / 60

// Total per month
monthHours = entries
  .filter(e => sameMonth(e.date, selectedMonth))
  .reduce((sum, e) => sum + calculateHours(e), 0)

// Total per worker
workerHours = entries
  .filter(e => e.worker_id === workerId)
  .reduce((sum, e) => sum + calculateHours(e), 0)
```

## Future Enhancements (Optional)

- Import from Excel/CSV
- Copy previous month's schedule
- Validate against expected hours
- Overtime calculation
- Export summary report
- Duplicate entry detection
- Bulk edit operations

## Testing Checklist

- [ ] Open "Surašyti iš lapų" modal
- [ ] Select a month
- [ ] Add an entry
- [ ] Verify hours auto-calculate
- [ ] Change times, verify recalculation
- [ ] Add multiple entries
- [ ] Check summary statistics
- [ ] Delete an entry
- [ ] Save entries
- [ ] Verify schedules appear in calendar
- [ ] Test with different workers
- [ ] Test with different months
- [ ] Verify work_location filter works
