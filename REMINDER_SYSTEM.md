# 🔔 Technika Reminder System

## Overview

A comprehensive reminder/notification system for the Technika module that monitors deadlines and maintenance schedules across all equipment, vehicles, and maintenance activities.

## Features

### 🎯 **Automatic Monitoring**
The system automatically monitors:

1. **Techninės Apžiūros (TA)** - Technical Inspections
   - Monitors `vehicles.technical_inspection_due_date`
   - Alerts when within 60 days or expired

2. **Draudimai** - Insurance
   - Monitors `vehicles.insurance_expiry_date`
   - Alerts when within 60 days or expired

3. **Gesintuvai** - Fire Extinguishers
   - Monitors `fire_extinguishers.expiry_date` and `next_inspection_date`
   - Alerts when within 60 days or expired

4. **Planiniai Technikos Aptarnavimai** - Planned Maintenance Schedules
   - Monitors `maintenance_schedules.next_due_date`
   - Alerts when within 60 days or overdue

5. **Fermos Įrangos Aptarnavimai** - Farm Equipment Maintenance
   - Monitors `farm_equipment_items.next_service_date`
   - Alerts when within 60 days or overdue

6. **Remonto Darbai** - Work Orders
   - Monitors `maintenance_work_orders.scheduled_date`
   - Alerts for pending/in-progress orders within 14 days

---

## Components

### 1. **TechnikaReminderService** (`src/lib/reminderService.ts`)

Core service that fetches and processes reminders from the database.

**Key Methods:**
```typescript
// Get all reminders sorted by priority
TechnikaReminderService.getAllReminders(): Promise<Reminder[]>

// Get reminder statistics
TechnikaReminderService.getReminderStats(): Promise<ReminderStats>

// Get reminders for specific date
TechnikaReminderService.getRemindersForDate(date: string): Promise<Reminder[]>

// Get reminders grouped by date
TechnikaReminderService.getRemindersGroupedByDate(): Promise<Record<string, Reminder[]>>
```

**Priority System:**
- **Critical**: Expired or due today/tomorrow
- **High**: Due within 7 days
- **Medium**: Due within 30 days
- **Low**: Due within 60 days

---

### 2. **ReminderNotification** (`src/components/technika/ReminderNotification.tsx`)

Floating notification widget that appears in the bottom-right corner.

**Features:**
- Shows top 5 most critical reminders
- Can be minimized to a badge with count
- Auto-refreshes every 5 minutes
- Shows "new reminder" pulse animation
- Click "Peržiūrėti viską" to expand to calendar view

**Display Logic:**
- Only shows critical/high priority reminders
- Only shows reminders for today, tomorrow, or expired
- Automatically minimizes when dismissed
- Badge color: Red (critical) or Orange (high priority)

---

### 3. **ReminderCalendarView** (`src/components/technika/ReminderCalendarView.tsx`)

Full-screen modal with comprehensive reminder management.

**Features:**
- **Two View Modes:**
  - **List View**: Scrollable list of all reminders with details
  - **Calendar View**: Month calendar with reminder counts per day

- **Statistics Dashboard:**
  - Expired count (red)
  - Today count (orange)
  - Tomorrow count (yellow)
  - Upcoming count (blue)

- **Filters:**
  - Filter by type (TA, Draudimas, Gesintuvas, etc.)
  - Filter by status (Expired, Today, Tomorrow, Upcoming)

- **Calendar Features:**
  - Navigate between months
  - Visual indicators for days with reminders
  - Color coding based on priority
  - Hover to see reminder details

---

## Integration

### In Technika Component (`src/components/Technika.tsx`)

```tsx
import { ReminderNotification } from './technika/ReminderNotification';
import { ReminderCalendarView } from './technika/ReminderCalendarView';

export function Technika({ onBackToModules }: TechnikaProps) {
  const [showReminderCalendar, setShowReminderCalendar] = useState(false);

  return (
    <div>
      {/* ... other content ... */}

      {/* Floating notification */}
      <ReminderNotification onViewAll={() => setShowReminderCalendar(true)} />

      {/* Full calendar modal */}
      {showReminderCalendar && (
        <ReminderCalendarView onClose={() => setShowReminderCalendar(false)} />
      )}
    </div>
  );
}
```

---

## Data Structure

### Reminder Interface

```typescript
interface Reminder {
  id: string;
  type: 'technical_inspection' | 'insurance' | 'fire_extinguisher' | 
        'maintenance_schedule' | 'farm_equipment' | 'work_order';
  title: string;              // e.g., "Techninė apžiūra"
  description: string;        // e.g., "VOLVO 121 TA"
  dueDate: string;            // ISO date string
  daysUntil: number;          // Negative if expired
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'expired' | 'today' | 'tomorrow' | 'upcoming';
  relatedId: string;          // UUID of related entity
  relatedEntity: string;      // Display name (e.g., "VOLVO 121 TA")
  category: string;           // Display category (e.g., "TA", "Draudimas")
}
```

---

## User Experience

### Initial Load
1. User opens Technika module
2. System automatically fetches all reminders
3. If reminders exist, floating notification appears bottom-right
4. Badge shows total count

### Minimized State
- Small circular badge with bell icon
- Shows count of critical/high priority reminders
- Red badge if any expired/today
- Orange badge if only high priority
- Pulse animation if new reminders detected

### Expanded State (Floating Widget)
- Shows top 5 most critical reminders
- Each reminder shows:
  - Icon (based on status)
  - Category name
  - Description
  - Status badge (e.g., "Pasibaigė prieš 2 d.", "Šiandien", "Rytoj")
  - Due date
- Click "Peržiūrėti viską" to open full calendar

### Full Calendar View
1. **Statistics at top**: Visual overview of reminder counts
2. **Filters**: Narrow down by type or status
3. **View Toggle**: Switch between list and calendar
4. **List View**: 
   - All reminders with full details
   - Priority and status badges
   - Sorted by urgency
5. **Calendar View**:
   - Monthly calendar
   - Days with reminders highlighted
   - Badge with count
   - Color-coded by priority

---

## Example Scenarios

### Scenario 1: Expired Insurance
```
Status: CRITICAL
Display: "Draudimas - VOLVO 121 TA"
Badge: Red "Pasibaigė prieš 1 d."
```

### Scenario 2: TA Tomorrow
```
Status: CRITICAL
Display: "Techninė apžiūra - VOLVO 121 TA"
Badge: Orange "Rytoj"
```

### Scenario 3: Fire Extinguisher Inspection Due
```
Status: HIGH
Display: "Gesintuvų patikra - GE-001 - Dirbtuvės"
Badge: Orange "Po 5 d."
```

### Scenario 4: Planned Maintenance Coming Up
```
Status: MEDIUM
Display: "Planinis aptarnavimas - VOLVO - Tepalų keitimas"
Badge: Yellow "Po 15 d."
```

---

## Customization Options

### Reminder Thresholds
Currently set in `reminderService.ts`:
- Technical inspections: 60 days
- Insurance: 60 days
- Fire extinguishers: 60 days
- Maintenance schedules: 60 days
- Farm equipment: 60 days
- Work orders: 14 days

**To modify**: Edit the filter conditions in each fetch method.

### Refresh Interval
Currently: 5 minutes (300,000ms)

**To modify**: Edit in `ReminderNotification.tsx`:
```typescript
const interval = setInterval(() => {
  loadReminders();
}, 5 * 60 * 1000); // Change this value
```

### Floating Widget Position
Currently: Bottom-right (`bottom-6 right-6`)

**To modify**: Edit className in `ReminderNotification.tsx`:
```tsx
<div className="fixed bottom-6 right-6 z-50 max-w-md">
  {/* Change to: top-6 right-6 for top-right */}
</div>
```

---

## Database Dependencies

### Required Tables
- `vehicles` (technical_inspection_due_date, insurance_expiry_date)
- `fire_extinguishers` (expiry_date, next_inspection_date)
- `maintenance_schedules` (next_due_date)
- `farm_equipment_items` (next_service_date)
- `maintenance_work_orders` (scheduled_date, status)

### Required Views
None - queries directly against tables

### Row Level Security (RLS)
- Uses existing RLS policies
- Respects user permissions
- No special permissions needed

---

## Performance Considerations

- **Caching**: No caching implemented - fetches fresh data each time
- **Auto-refresh**: 5-minute interval prevents excessive DB queries
- **Filtering**: All filtering done client-side after fetch
- **Optimization**: Selects only required fields from database

**For large datasets**, consider:
1. Add server-side filtering
2. Implement caching with Supabase realtime subscriptions
3. Use database views for pre-calculated reminder data

---

## Future Enhancements

### Possible Additions
1. **Email/SMS Notifications**: Send alerts for critical reminders
2. **Snooze Function**: Dismiss reminders temporarily
3. **Custom Reminder Rules**: User-defined thresholds per vehicle/equipment
4. **Reminder History**: Track when reminders were acknowledged
5. **Quick Actions**: Complete maintenance directly from reminder
6. **Integration with Work Orders**: Auto-create work order from reminder
7. **Mobile Push Notifications**: If mobile app is developed
8. **Recurring Reminders**: Set up custom recurring alerts

---

## Troubleshooting

### Reminders Not Showing
1. Check browser console for errors
2. Verify database has data in required tables
3. Check RLS policies allow reading
4. Verify dates are in correct format (YYYY-MM-DD)

### Incorrect Counts
1. Check date calculations in `getDaysUntil()`
2. Verify timezone handling
3. Check filter logic in each fetch method

### Performance Issues
1. Check number of records being fetched
2. Add indexes on date columns
3. Consider implementing pagination
4. Add server-side filtering

---

## Testing

### Manual Testing Checklist
- [ ] Reminder appears when vehicle TA expires tomorrow
- [ ] Reminder appears when insurance expired yesterday
- [ ] Fire extinguisher expiry shows correctly
- [ ] Maintenance schedule due date triggers reminder
- [ ] Farm equipment service date shows correctly
- [ ] Work order scheduled date appears
- [ ] Minimized/expanded states work correctly
- [ ] "Peržiūrėti viską" opens calendar view
- [ ] Filter by type works
- [ ] Filter by status works
- [ ] Calendar view shows correct dates
- [ ] Month navigation works
- [ ] Auto-refresh updates reminders

---

## Support

For issues or questions:
1. Check database schema for required fields
2. Verify RLS policies
3. Check browser console for errors
4. Review `reminderService.ts` fetch methods

---

**Built with ❤️ for efficient equipment management**
