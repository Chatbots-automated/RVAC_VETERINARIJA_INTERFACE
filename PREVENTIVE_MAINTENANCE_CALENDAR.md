# Preventive Maintenance Calendar System

## Overview
Implemented a comprehensive calendar system for tracking preventive maintenance across three technika module tabs.

## Features Implemented

### 1. MaintenanceCalendar Component (`src/components/technika/MaintenanceCalendar.tsx`)

**Key Features:**
- **Full Month View**: Interactive calendar showing all maintenance events
- **Collapsible Design**: Can be collapsed to a compact summary bar
- **Color-Coded Events**: 
  - 🔴 Red: Overdue maintenance
  - 🟠 Orange: Due today
  - 🟡 Yellow: Upcoming (within 14 days)
  - 🟢 Green: OK (future)
- **Event Clustering**: Shows up to 2 events per day, with "+X more" indicator
- **Upcoming Events Sidebar**: Lists next 10 upcoming maintenance items
- **Interactive**: Click on events to open service/edit modals
- **Navigation**: Previous/Next month buttons, "Today" quick jump
- **Legend**: Visual guide for status colors

**UI/UX Highlights:**
- Beautiful gradient design (blue to purple)
- Smooth animations and transitions
- Responsive grid layout
- Today's date highlighted with blue ring
- Hover effects on clickable events

### 2. Integration into Three Tabs

#### A. Planiniai technikos aptarnavimai (MaintenanceSchedules)
**Events Source**: `maintenance_schedules` table
- Shows vehicle maintenance schedules
- Events based on `next_due_date`
- Click overdue/today events → Opens service modal
- Click future events → Opens edit modal
- Status calculation based on date comparison

#### B. Fermos įrangos aptarnavimai (FarmEquipmentMaintenance)
**Events Source**: `farm_equipment_items_detail` view
- Shows farm equipment component maintenance
- Events based on `next_service_date`
- Respects individual `reminder_days_before` settings
- Click any event → Opens service registration modal
- Displays equipment name + component name

#### C. Remonto darbai (WorkOrders)
**Events Source**: `maintenance_work_orders` table
- Shows scheduled repair work
- Events based on `scheduled_date`
- Filters out completed/cancelled orders
- Priority-based status (in_progress = today)
- Click event → Opens work order detail sidebar
- Shows work order number + priority

## Technical Implementation

### Calendar Event Structure
```typescript
interface CalendarEvent {
  id: string;
  title: string;           // Vehicle/Equipment name
  date: string;            // YYYY-MM-DD format
  status: 'overdue' | 'today' | 'upcoming' | 'ok';
  type?: string;           // Schedule/Item name
  details?: string;        // Full description
  onClick?: () => void;    // Action handler
}
```

### Status Logic
1. **Overdue**: Due date < today
2. **Today**: Due date = today
3. **Upcoming**: Due date within reminder period (7-14 days)
4. **OK**: Due date > reminder period

### State Management
- `showCalendar` state controls visibility
- Calendar can be closed via X button
- Collapsed state persists until user expands
- Events recalculated on data load

## User Workflow

### Typical Usage:
1. User opens maintenance tab
2. Calendar displays at top with all scheduled maintenance
3. User sees color-coded events at a glance
4. Click on overdue/today event → Directly register service
5. Click on future event → View/edit details
6. Use sidebar to see upcoming items in list format
7. Collapse calendar to save space if needed
8. Navigate months to plan ahead

### Multi-Event Days:
- Shows first 2 events inline
- "+X more" indicator for additional events
- All events listed in sidebar
- Click any event to take action

## Benefits

### For Management:
- **Visual Overview**: See entire month's maintenance at a glance
- **Priority Identification**: Red/orange events need immediate attention
- **Planning**: Navigate future months to allocate resources
- **Status Tracking**: Quickly see overdue vs. upcoming items

### For Mechanics:
- **Daily Checklist**: See today's tasks immediately
- **Prioritization**: Color coding shows urgency
- **Quick Access**: One click to register service
- **Context**: See equipment/vehicle details before clicking

### For Farm Operations:
- **Reduced Downtime**: Proactive maintenance prevents breakdowns
- **Cost Savings**: Prevent expensive emergency repairs
- **Compliance**: Track all maintenance schedules
- **Accountability**: Clear visibility of what's due when

## Data Sources

### Database Tables/Views Used:
1. `maintenance_schedules` - Vehicle maintenance schedules
2. `farm_equipment_items_detail` - Farm equipment service items (view)
3. `maintenance_work_orders` - Repair work orders

### Key Fields:
- `next_due_date` / `next_service_date` / `scheduled_date`
- `status` (for work orders)
- `reminder_days_before` (for equipment items)
- Vehicle/equipment identification
- Service descriptions

## Future Enhancements (Potential)

1. **Filters**: Filter calendar by vehicle, equipment type, priority
2. **Export**: Export calendar to PDF/Excel
3. **Notifications**: Email/SMS alerts for upcoming maintenance
4. **Drag & Drop**: Reschedule by dragging events
5. **Multi-Select**: Batch operations on multiple events
6. **Print View**: Printer-friendly calendar format
7. **Mobile App**: Native mobile calendar integration
8. **Recurring Patterns**: Visual indication of recurring maintenance
9. **Cost Overlay**: Show estimated costs on calendar
10. **Weather Integration**: Suggest optimal maintenance days based on weather

## Files Modified

1. ✅ Created: `src/components/technika/MaintenanceCalendar.tsx`
2. ✅ Updated: `src/components/technika/MaintenanceSchedules.tsx`
3. ✅ Updated: `src/components/technika/FarmEquipmentMaintenance.tsx`
4. ✅ Updated: `src/components/technika/WorkOrders.tsx`

## Testing Checklist

- [ ] Calendar displays correctly in all three tabs
- [ ] Events show with correct colors
- [ ] Click events opens correct modals
- [ ] Month navigation works
- [ ] Today button jumps to current month
- [ ] Collapse/expand functionality works
- [ ] Multiple events per day display correctly
- [ ] Sidebar shows upcoming events
- [ ] Calendar closes via X button
- [ ] Responsive on mobile/tablet
- [ ] No console errors
- [ ] Performance with 100+ events

## Notes

- Calendar is shown by default (`showCalendar: true`)
- User can close it permanently per session
- Events are recalculated on each data load
- Calendar uses Lithuanian locale for dates
- All text is in Lithuanian
- No database changes required - uses existing data
