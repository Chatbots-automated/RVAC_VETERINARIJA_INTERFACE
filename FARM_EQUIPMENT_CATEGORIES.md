# Farm Equipment Service Categories

## Overview
Added 6 new specific categories for farm equipment maintenance and repairs in the Fermos įranga module.

## New Categories

### 1. **Periodinis servisas** (Periodic Service) 🟢
- **Color:** Green
- **Purpose:** Regular scheduled maintenance
- **Examples:** 
  - Routine oil changes
  - Filter replacements
  - Regular inspections
  - Preventive maintenance

### 2. **Gedimo taisymas** (Breakdown Repair) 🔴
- **Color:** Red
- **Purpose:** Emergency repairs when equipment breaks down
- **Examples:**
  - Equipment failures
  - Urgent repairs
  - Emergency fixes
  - Critical breakdowns

### 3. **Dalių keitimas** (Parts Replacement) 🟠
- **Color:** Orange
- **Purpose:** Replacing worn or damaged parts
- **Examples:**
  - Worn bearings
  - Damaged hoses
  - Broken belts
  - Replacement components

### 4. **Modernizavimas** (Modernization) 🟣
- **Color:** Purple
- **Purpose:** Upgrades and improvements to equipment
- **Examples:**
  - Technology upgrades
  - Efficiency improvements
  - New features
  - System enhancements

### 5. **Saugos patikra** (Safety Inspection) 🟡
- **Color:** Yellow
- **Purpose:** Safety inspections and compliance checks
- **Examples:**
  - Safety audits
  - Compliance checks
  - Regulatory inspections
  - Safety certifications

### 6. **Valymas ir priežiūra** (Cleaning and Maintenance) 🔵
- **Color:** Cyan
- **Purpose:** Routine cleaning and upkeep
- **Examples:**
  - Equipment cleaning
  - Lubrication
  - Basic maintenance
  - Housekeeping

## Database Changes

### Migration File
**`supabase/migrations/20260218_add_farm_equipment_categories.sql`**

**Changes:**
1. Updated `assignment_type` constraint to include 6 new types
2. Added `service_category` column (optional text field)
3. Added `farm_equipment_id` column (links to specific equipment)
4. Created index for faster queries

**Run this migration:**
```bash
# Apply in Supabase SQL Editor
```

## UI Changes

### When in Fermos įranga Module

**Assignment Modal now shows:**

1. **Farm Equipment Categories** (top section)
   - 6 color-coded buttons in 2x3 grid
   - Each with clear description
   - Distinct colors for easy identification

2. **General Categories** (bottom section)
   - Tool/Equipment
   - Building
   - General Farm
   - (Transport services hidden in farm module)

### Visual Design

- **Farm categories:** Smaller, compact design (2x3 grid)
- **Color coding:** Each category has unique color
- **Clear labels:** Lithuanian names + descriptions
- **Responsive:** Works on all screen sizes

## How to Use

### Assigning Farm Equipment Services

1. **Upload invoice** in Fermos įranga module
2. **Parse invoice**
3. **Assign items:**
   - Select appropriate service category:
     - **Green** = Regular maintenance
     - **Red** = Emergency repair
     - **Orange** = Parts replacement
     - **Purple** = Upgrade
     - **Yellow** = Safety check
     - **Cyan** = Cleaning
   - Or use general categories if needed
4. **Save assignment**

### Benefits

**Better Organization:**
- Track different types of maintenance separately
- Identify patterns (e.g., frequent breakdowns)
- Plan preventive maintenance better

**Cost Analysis:**
- See spending by service type
- Compare emergency vs. planned maintenance costs
- Budget more accurately

**Compliance:**
- Track safety inspections
- Maintain service records
- Meet regulatory requirements

## Reporting

These categories can be used for:
- Cost analysis by service type
- Maintenance history tracking
- Budget planning
- Compliance reporting
- Equipment lifecycle analysis

## Future Enhancements (Optional)

- Reports tab showing costs by category
- Trend analysis (emergency repairs increasing?)
- Alerts for overdue periodic services
- Integration with maintenance schedules
- Cost comparison between categories

## Testing Checklist

- [ ] Run database migration
- [ ] Go to Fermos įranga module
- [ ] Upload an invoice
- [ ] Verify 6 farm equipment categories appear
- [ ] Test each category selection
- [ ] Verify color coding
- [ ] Assign item to "Periodinis servisas"
- [ ] Check database record saved correctly
- [ ] Verify general categories still work
- [ ] Test in Technikos kiemas (should not show farm categories)
