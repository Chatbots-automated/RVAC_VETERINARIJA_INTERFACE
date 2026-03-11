# Darbuotojai Module Enhancement

## Overview
Enhanced the manual time entry system ("Surašyti iš lapų") for both Ferma and Technikos Kiemas with advanced features for different worker types, lunch tracking, and dynamic measurement units.

## New Features

### 1. Worker Type Classification
Workers can now be classified into three types:
- **Darbuotojas** (Regular Worker) - Tracks work description
- **Vairuotojas** (Driver) - Tracks distance/measurements driven
- **Traktorininkas** (Tractor Operator) - Tracks hectares/measurements worked

### 2. Lunch Deduction System
Each day entry now includes lunch tracking with automatic hour deduction:
- **Be pietų (None)** - No lunch break, no deduction
- **Pusė pietų (Half)** - 30-minute lunch break, deducts 0.5 hours
- **Pilni pietūs (Full)** - 1-hour lunch break, deducts 1 hour (default)

The hours are automatically recalculated based on the lunch selection.

### 3. Auto-Formatting Time Inputs
Time entry fields now have smart auto-formatting:
- Type 4 digits (e.g., "0810") and it automatically formats to "08:10"
- After entering start time (4 digits), cursor automatically moves to end time
- After entering end time, cursor automatically moves to start time of next day
- No need to manually type the colon (:) symbol

### 4. Dynamic Work Description/Measurement
The input field changes based on worker type:

**For Darbuotojas:**
- Text field for "Atliekamas darbas" (Work description)
- Manually entered description of work performed

**For Vairuotojas & Traktorininkas:**
- Numeric field for measurement value
- Dropdown for measurement unit
- Units are dynamically managed and can be customized

### 5. Measurement Units Management
New tab "Matavimo vienetai" allows creating custom measurement units:

**Default Units for Vairuotojas (Driver):**
- Kilometrai (km)
- Priekaba (prk) - Trailer
- Tona (t) - Ton
- Kibiras (kib) - Bucket
- Reisas (reis) - Trip

**Default Units for Traktorininkas (Tractor Operator):**
- Hektarai (ha) - Hectares
- Priekaba (prk) - Trailer
- Tona (t) - Ton
- Kibiras (kib) - Bucket
- Reisas (reis) - Trip

Users can add custom units with:
- Unit name (e.g., "Priekaba")
- Unit abbreviation (e.g., "prk")
- Worker type (Vairuotojas or Traktorininkas)

### 6. Bulk Fill Enhancement
The "Užpildyti visas dienas" feature now includes:
- Start time
- End time
- Worker type selection
- Lunch type selection

All selected options are applied to all working days at once.

### 7. Copy from Previous Day
The copy function now copies all fields:
- Start time
- End time
- Worker type
- Lunch type
- Work description
- Measurement value
- Measurement unit

## Database Changes

### New Table: `measurement_units`
```sql
CREATE TABLE measurement_units (
  id uuid PRIMARY KEY,
  work_location text (farm/warehouse/both),
  worker_type text (vairuotojas/traktorininkas),
  unit_name text,
  unit_abbreviation text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
);
```

### Enhanced Table: `manual_time_entries`
New columns added:
- `worker_type` - Type of worker (darbuotojas/vairuotojas/traktorininkas)
- `lunch_type` - Lunch break type (none/half/full)
- `work_description` - Description of work (for darbuotojas)
- `measurement_value` - Numeric measurement (for vairuotojas/traktorininkas)
- `measurement_unit_id` - Reference to measurement unit

Updated `hours_worked` calculation:
- Now automatically deducts lunch time based on `lunch_type`
- Formula: `(end_time - start_time) - lunch_deduction`

## User Interface Changes

### Įvesti iš lapų (Input Tab)
**Enhanced Table Columns:**
1. Data (Date)
2. Pradžia (Start) - Auto-formatting input
3. Pabaiga (End) - Auto-formatting input
4. Tipas (Type) - Dropdown: Darb./Vair./Trakt.
5. Pietūs (Lunch) - Dropdown: Be/Pusė/Pilni
6. Darbas/Matavimas (Work/Measurement) - Dynamic field based on type
7. Val. (Hours) - Auto-calculated with lunch deduction
8. Copy button

**Bulk Fill Dialog:**
- Pradžia (Start time)
- Pabaiga (End time)
- Darbuotojo tipas (Worker type)
- Pietūs (Lunch type)

### Peržiūra (Review Tab)
**Enhanced Table Columns:**
1. Data (Date)
2. Pradžia (Start)
3. Pabaiga (End)
4. Tipas (Type) - Badge display
5. Pietūs (Lunch) - Badge display
6. Darbas/Matavimas (Work/Measurement) - Shows description or measurement
7. Val. (Hours) - With lunch deduction applied
8. Edit button

**Edit Mode:**
All fields are editable including worker type, lunch type, and work description/measurement.

### Matavimo vienetai (Measurement Units Tab)
**Add New Unit Form:**
- Darbuotojo tipas (Worker type) - Dropdown
- Pavadinimas (Name) - Text input
- Santrumpa (Abbreviation) - Text input
- Pridėti (Add) button

**Units Display:**
Two columns showing units for:
- Vairuotojas (Driver)
- Traktorininkas (Tractor Operator)

Each unit shows:
- Unit name
- Abbreviation
- Delete button

## Usage Examples

### Example 1: Regular Worker Entry
1. Select worker type: "Darbuotojas"
2. Enter start time: Type "0800" → Auto-formats to "08:00"
3. Enter end time: Type "1700" → Auto-formats to "17:00"
4. Select lunch: "Pilni pietūs (1h)"
5. Enter work description: "Gyvulių šėrimas"
6. Hours calculated: 9h - 1h = 8h

### Example 2: Driver Entry
1. Select worker type: "Vairuotojas"
2. Enter start time: "0800"
3. Enter end time: "1600"
4. Select lunch: "Pusė pietų (30min)"
5. Enter measurement: "150" km
6. Hours calculated: 8h - 0.5h = 7.5h

### Example 3: Tractor Operator Entry
1. Select worker type: "Traktorininkas"
2. Enter start time: "0700"
3. Enter end time: "1900"
4. Select lunch: "Pilni pietūs (1h)"
5. Enter measurement: "25" ha (hectares)
6. Hours calculated: 12h - 1h = 11h

### Example 4: Creating Custom Measurement Unit
1. Go to "Matavimo vienetai" tab
2. Select worker type: "Vairuotojas"
3. Enter name: "Kubas"
4. Enter abbreviation: "m³"
5. Click "Pridėti"
6. Unit is now available in the dropdown for drivers

## Migration Instructions

1. **Apply Database Migration:**
   ```bash
   cd supabase
   npx supabase db reset
   # OR if using remote database:
   npx supabase db push
   ```

2. **Default Measurement Units:**
   The migration automatically creates default measurement units for both driver and tractor operator types.

3. **Existing Data:**
   - Existing entries will default to `worker_type: 'darbuotojas'`
   - Existing entries will default to `lunch_type: 'full'`
   - Hours will be recalculated with lunch deduction

## Technical Implementation

### Auto-Formatting Logic
```typescript
const handleTimeInput = (date: string, field: 'start_time' | 'end_time', value: string) => {
  const digits = value.replace(/\D/g, '');
  let formatted = digits;
  if (digits.length >= 2) {
    formatted = digits.slice(0, 2) + ':' + digits.slice(2, 4);
  }
  updateDayEntry(date, field, formatted);
  
  // Auto-advance after 4 digits
  if (digits.length === 4) {
    // Move to next field
  }
};
```

### Hours Calculation with Lunch Deduction
```typescript
function calculateHours(startTime: string, endTime: string, lunchType: 'none' | 'half' | 'full'): number {
  let hours = (endMinutes - startMinutes) / 60;
  
  if (lunchType === 'full') {
    hours = Math.max(0, hours - 1);
  } else if (lunchType === 'half') {
    hours = Math.max(0, hours - 0.5);
  }
  
  return hours;
}
```

### Database Trigger for Hours Calculation
```sql
ALTER TABLE manual_time_entries ADD COLUMN hours_worked numeric(5,2) GENERATED ALWAYS AS (
  CASE 
    WHEN lunch_type = 'full' THEN 
      GREATEST(0, (EXTRACT(EPOCH FROM (end_time - start_time)) / 3600) - 1)
    WHEN lunch_type = 'half' THEN 
      GREATEST(0, (EXTRACT(EPOCH FROM (end_time - start_time)) / 3600) - 0.5)
    ELSE 
      EXTRACT(EPOCH FROM (end_time - start_time)) / 3600
  END
) STORED;
```

## Benefits

1. **Faster Data Entry:** Auto-formatting and auto-advancing reduces typing time
2. **Accurate Hours:** Automatic lunch deduction ensures correct hour calculations
3. **Flexible Tracking:** Different worker types track relevant metrics
4. **Customizable Units:** Organizations can create units that match their needs
5. **Better Reporting:** Differentiated data allows for better analysis by worker type
6. **Reduced Errors:** Automatic calculations reduce manual calculation errors

## Future Enhancements

Potential future improvements:
- Export reports by worker type
- Measurement unit analytics (total km driven, total hectares worked)
- Worker performance metrics based on measurements
- Integration with payroll based on worker type and hours
- Mobile app for workers to enter their own data
- GPS tracking integration for drivers
- Equipment usage tracking for tractor operators

## Support

For issues or questions:
1. Check the UI tooltips for field-specific help
2. Review this documentation
3. Contact system administrator
4. Check the database migration file for technical details

## Version History

- **v2.0** (2026-03-04) - Enhanced with worker types, lunch tracking, and measurement units
- **v1.0** - Initial manual time entry system
