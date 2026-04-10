# SQL Scripts for Testing

This folder contains SQL scripts to help with testing and cleanup.

## Available Scripts

### 1. `delete_test_treatments.sql`
**Purpose:** Comprehensive script for deleting test treatments with full control.

**Features:**
- Step-by-step process with review queries
- Returns stock to batches automatically
- Multiple filtering options (date, diagnosis, vet, animal)
- Includes alternative for deleting specific treatment by ID
- Detailed comments and safety checks

**Usage:**
1. Open in Supabase Dashboard SQL Editor
2. Modify the WHERE conditions to match your test data
3. Run STEP 1 and STEP 2 to review what will be deleted
4. Run STEP 3-6 to delete and return stock

**Example Filters:**
```sql
-- By date
WHERE t.reg_date >= '2026-04-09'

-- By diagnosis
WHERE t.clinical_diagnosis ILIKE '%test%'

-- By vet name
WHERE t.vet_name = 'Test Vet'

-- By animal
WHERE a.tag_no = 'LT123456'
```

### 2. `delete_todays_treatments.sql`
**Purpose:** Quick script to delete all treatments created today.

**Features:**
- Simple one-click deletion
- Perfect for end-of-day test cleanup
- Automatically returns stock
- Shows preview before deletion

**Usage:**
1. Open in Supabase Dashboard SQL Editor
2. Run the entire script
3. All today's treatments will be deleted and stock returned

**When to Use:**
- End of testing session
- Quick cleanup after creating test data
- Daily development workflow

### 3. `delete_by_animal.sql`
**Purpose:** Delete all treatments for a specific animal.

**Features:**
- Target specific animal by tag number
- Returns all stock from that animal's treatments
- Useful for resetting a test animal

**Usage:**
1. Replace `'LT123456'` with your animal's tag number
2. Run in Supabase Dashboard SQL Editor

## Important Notes

⚠️ **WARNING: These scripts permanently delete data!**

- Always run the preview/review queries first
- Cannot be undone
- Test in development environment first
- Make sure you're deleting the right data

## How Stock Return Works

All scripts automatically:
1. Find usage_items and treatment_courses linked to treatments
2. Add quantities back to batches
3. Update batch status (depleted → active if qty > 0)
4. Delete the treatment records

This ensures your inventory stays accurate even when deleting test data.

## Best Practices

1. **For Daily Testing:**
   - Use `delete_todays_treatments.sql` at end of day
   - Quick and safe for development

2. **For Specific Cleanup:**
   - Use `delete_test_treatments.sql` with custom filters
   - Review queries before deleting

3. **For Production:**
   - Consider adding `is_test` flag to treatments instead of deleting
   - Keep audit trail of all treatments
   - Use soft deletes

## Troubleshooting

**Stock not returning correctly?**
- Check if batch_id is NULL in usage_items
- Verify batches table has correct qty_left values
- Look for errors in NOTICE messages

**Foreign key constraint errors?**
- Scripts handle deletion order automatically
- If errors occur, check for custom foreign keys

**Nothing deleted?**
- Verify WHERE conditions match your data
- Run the preview queries to see what matches
- Check date formats (YYYY-MM-DD)

## Example Workflow

```sql
-- 1. Morning: Start testing
-- Create test treatments...

-- 2. During day: Check what you created
SELECT * FROM treatments WHERE reg_date = CURRENT_DATE;

-- 3. End of day: Clean up
-- Run delete_todays_treatments.sql

-- 4. Verify cleanup
SELECT COUNT(*) FROM treatments WHERE reg_date = CURRENT_DATE;
-- Should return 0
```

## Support

If you need to delete other types of records:
- Vaccinations: Similar pattern, but use `vaccinations` table
- Preventions: Use `preventions` table
- Visits: Use `animal_visits` table

Contact the development team for custom cleanup scripts.
