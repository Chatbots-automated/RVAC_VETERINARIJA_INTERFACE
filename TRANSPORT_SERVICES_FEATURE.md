# Transport Services Tracking Feature

## Overview
Added ability to track transport service expenses by company in the Technika module.

## Database Changes

### Migration File
**`supabase/migrations/20260218_add_transport_services.sql`**

This migration:
- Adds `'transport_service'` to the `assignment_type` CHECK constraint
- Adds `transport_company` column to store the company name
- Creates an index for faster queries

**Run this migration:**
```sql
-- In Supabase SQL Editor or via CLI
```

## Features Implemented

### 1. Invoice Assignment - New Category ✅

When assigning invoice items, there's now a new option:

**"Transporto paslaugos"** (Transport Services)
- Automatically pre-fills the company name from the parsed invoice supplier
- User can edit the company name if needed
- Stores the transport company for reporting

**Location:** `Saskaitos` tab → Upload invoice → Assign items → Select "Transporto paslaugos"

### 2. Reports Tab - Transport Services ✅

New tab in the `Ataskaitos` (Reports) section:

**"Transporto paslaugos"** tab shows:
- **Summary Statistics:**
  - Total cost of all transport services
  - Number of companies used
  - Number of invoices

- **Breakdown by Company:**
  - Each company shown with:
    - Total cost
    - Number of invoices
    - Average cost per invoice
  - Expandable list showing all individual service items
  - Invoice details (number, date)
  - Item descriptions and prices

**Location:** `Ataskaitos` tab → "Transporto paslaugos" tab

## How to Use

### Assigning Transport Services

1. **Upload an invoice** in the `Saskaitos` tab
2. **Parse the invoice** (click "Apdoroti pasirinktas")
3. **Assign items**:
   - Click "Priskirti" on an invoice item
   - Select **"Transporto paslaugos"** category
   - Company name is auto-filled from invoice supplier
   - Edit company name if needed
   - Add optional notes
   - Click "Išsaugoti"

### Viewing Transport Reports

1. Go to **`Ataskaitos`** tab
2. Click **"Transporto paslaugos"** tab
3. View:
   - Total spending on transport
   - Which companies you use
   - Detailed breakdown per company
   - Individual service items and invoices

### Filtering by Date

Use the date filter at the top of the reports to:
- View transport costs for specific periods
- Compare spending across different timeframes
- Generate reports for accounting

## Technical Details

### Database Schema

```sql
-- equipment_invoice_item_assignments table
assignment_type: 'transport_service'  -- New type
transport_company: text                -- Company name
```

### Data Flow

1. **Invoice Upload** → Parse PDF
2. **Item Assignment** → Select "Transporto paslaugos"
3. **Store** → `equipment_invoice_item_assignments` with `assignment_type='transport_service'`
4. **Report** → Query and group by `transport_company`

### Query Logic

The report:
- Filters assignments where `assignment_type = 'transport_service'`
- Joins with invoice items and invoices for details
- Groups by `transport_company`
- Calculates totals and averages
- Sorts by total cost (highest first)

## Benefits

1. **Track Transport Costs**: See exactly how much you spend on transport services
2. **Compare Providers**: Identify which companies are most/least expensive
3. **Budget Planning**: Historical data for future budgeting
4. **Invoice Organization**: All transport-related invoices in one place
5. **Reporting**: Easy to generate reports for accounting/tax purposes

## Example Use Cases

### Use Case 1: Delivery Services
- Assign delivery charges to "Transporto paslaugos"
- Track which delivery company is used
- Compare costs between providers

### Use Case 2: Freight Services
- Track freight charges for equipment/parts
- Monitor spending per freight company
- Identify cost-saving opportunities

### Use Case 3: Monthly Reports
- Filter by month
- See total transport spending
- Export for accounting

## Testing Checklist

- [ ] Run database migration
- [ ] Upload an invoice with transport services
- [ ] Assign item to "Transporto paslaugos" category
- [ ] Verify company name is auto-filled
- [ ] Edit company name
- [ ] Save assignment
- [ ] Go to Ataskaitos → Transporto paslaugos tab
- [ ] Verify statistics are correct
- [ ] Verify company breakdown shows correct data
- [ ] Test date filtering
- [ ] Upload multiple invoices from different companies
- [ ] Verify grouping by company works correctly

## Future Enhancements (Optional)

- Export transport report to Excel/PDF
- Chart showing transport costs over time
- Compare costs between companies visually
- Set budget alerts for transport spending
- Integration with transport company APIs for automatic tracking
