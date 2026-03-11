# Manual Time Entry System (Surašyti iš lapų)

## Overview
Super simple keyboard-based time entry system for entering worker hours from paper timesheets.

## How It Works

### For Secretary/Admin:
1. Click **"Surašyti iš lapų"** button in Darbuotojų grafikai
2. Click **"Pridėti įrašą"** for each day entry
3. Fill in with keyboard:
   - Select worker from dropdown
   - Enter date
   - Type start time (e.g., `08:19`)
   - Type end time (e.g., `18:53`)
   - Hours are **automatically calculated**
4. Review the summary showing:
   - Hours per week for each worker
   - Total monthly hours per worker
   - Overall totals
5. Click **"Išsaugoti grafikus"**

## Features

### Automatic Calculations
- **Hours**: Automatically calculated from start/end times
- **Weekly Totals**: Shows hours per week (S1, S2, S3, etc.)
- **Monthly Totals**: Shows total hours for the month
- **Days Worked**: Counts total working days

### Data Storage
Data is saved in two places:
1. **`worker_schedules`** - For calendar display
2. **`manual_time_entries`** - For future worker access (when implemented)

### Future Worker Access
The `manual_time_entries` table is prepared for workers to:
- View their own time entries
- See their work history
- Check their hours

This feature is **not yet implemented** but the database structure is ready.

## UI Design
- **Simple row layout**: One line per entry
- **Numbered entries**: Easy to track (1, 2, 3...)
- **Real-time calculation**: Hours show immediately
- **Color-coded summary**: Blue for hours, green for days
- **Weekly breakdown**: See hours per week at a glance

## Database Schema

```sql
manual_time_entries:
  - worker_id (who worked)
  - entry_date (when)
  - start_time (e.g., 08:19)
  - end_time (e.g., 18:53)
  - hours_worked (auto-calculated)
  - entered_by (who entered the data)
```

## Example Workflow
1. Secretary receives paper timesheets at end of month
2. Opens "Surašyti iš lapų"
3. For each day on the paper:
   - Add entry
   - Select worker: "Jonas Jonaitis"
   - Date: "2026-02-15"
   - Start: "08:19"
   - End: "18:53"
   - Sees: "10.6h" calculated automatically
4. Repeats for all entries
5. Reviews weekly/monthly totals
6. Saves all at once

## Benefits
- ✅ **Fast keyboard entry** - no mouse clicking needed
- ✅ **Automatic calculations** - no manual math
- ✅ **Weekly breakdown** - see patterns easily
- ✅ **Future-proof** - ready for worker self-service
- ✅ **Simple UI** - minimal learning curve
