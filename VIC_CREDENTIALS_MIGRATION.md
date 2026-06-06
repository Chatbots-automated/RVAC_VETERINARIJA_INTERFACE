# VIC Credentials Migration Guide

## Overview

This migration moves VIC (Veterinary Information Center) credentials from being stored per-farm to being stored in a dedicated organization-wide table. This means VIC credentials are managed centrally and automatically apply to all farms and all users in the organization.

## Changes Made

### 1. Database Schema Changes

Three migration files have been created in `supabase/migrations/`:

- **20260607000001_create_vic_credentials_table.sql**
  - Creates a new `vic_credentials` table for organization-wide VIC credentials
  - Includes RLS policies (admins can manage, all users can view active credentials)
  - Supports multiple credential sets (though typically only one active set)
  
- **20260607000002_migrate_vic_data_to_vic_credentials_table.sql**
  - Migrates existing VIC credentials from farms table to the new vic_credentials table
  - Deduplicates credentials if multiple farms used the same credentials
  
- **20260607000003_remove_vic_credentials_from_farms.sql**
  - Removes `vic_username` and `vic_password` columns from the `farms` table
  - **Run this ONLY after verifying the data migration was successful**

### 2. New Database Table Structure

```sql
CREATE TABLE public.vic_credentials (
    id uuid PRIMARY KEY,
    vic_username text NOT NULL,
    vic_password text NOT NULL,
    description text,
    is_active boolean DEFAULT true,
    created_at timestamptz,
    updated_at timestamptz,
    created_by uuid REFERENCES users(id),
    updated_by uuid REFERENCES users(id)
);
```

### 3. TypeScript Interface Updates

Updated the following interfaces:

- **FarmContext.tsx**: Removed `vic_username` and `vic_password` from the `Farm` interface
- **Farms.tsx**: Removed `vic_username` and `vic_password` from the local `Farm` interface
- **VICCredentials.tsx**: Updated to use the new `vic_credentials` table instead of user table

### 3. UI Changes

#### Farms Component (`src/components/Farms.tsx`)
- Removed the VIC credentials section from farm creation/editing forms
- Removed VIC fields from database insert/update operations

#### Module Selector (`src/components/ModuleSelector.tsx`)
- Added a "VIC duomenys" button next to the logout button in the "Prisijungęs kaip" section
- Integrated the new VIC Credentials modal

#### VIC Credentials Modal (`src/components/VICCredentials.tsx`)
- New modal component for managing user VIC credentials
- Features:
  - View and edit VIC username and password
  - Password visibility toggle
  - Informational message explaining that credentials apply to all farms
  - Save and cancel buttons

## How to Apply the Migration

### Step 1: Backup Your Database
Before applying any migrations, create a backup of your database.

### Step 2: Apply the Migrations

You can apply the migrations in two ways:

#### Option A: Using Supabase CLI (Recommended)
```bash
# Apply all pending migrations
supabase db push

# Or apply them individually
supabase db push --include-all
```

#### Option B: Using the Supabase Dashboard
1. Go to your Supabase project dashboard
2. Navigate to the SQL Editor
3. Copy and paste the contents of each migration file in order:
   - First: `20260607000001_add_vic_credentials_to_users.sql`
   - Second: `20260607000002_migrate_vic_data_from_farms_to_users.sql`
   - Third: `20260607000003_remove_vic_credentials_from_farms.sql`
4. Execute each one in order

### Step 3: Verify the Migration

After applying the first two migrations, verify that:

1. The `vic_credentials` table was created successfully:
   ```sql
   SELECT * FROM vic_credentials;
   ```

2. VIC credentials have been migrated from farms:
   ```sql
   -- Check migrated credentials
   SELECT id, vic_username, description, is_active, created_at 
   FROM vic_credentials;
   ```

3. Compare with original farm data (run this BEFORE applying migration 3):
   ```sql
   -- Check original farm VIC data
   SELECT id, name, vic_username 
   FROM farms 
   WHERE vic_username IS NOT NULL;
   ```

### Step 4: Test the UI

1. Log in as an admin user
2. Click the "VIC duomenys" button on the module selector
3. Verify you can see the migrated credentials
4. Try editing and saving the credentials
5. Verify the changes are saved correctly

### Step 5: Apply Final Migration (Remove VIC from Farms)

Only after verifying the data migration was successful:

```bash
# Apply the final migration
supabase db push
```

Or run the third migration file manually via the SQL Editor.

## Accessing VIC Credentials from n8n or External Services

### Query the VIC Credentials

```sql
-- Get the active VIC credentials (organization-wide)
SELECT vic_username, vic_password 
FROM vic_credentials 
WHERE is_active = true
ORDER BY created_at DESC
LIMIT 1;

-- Get all VIC credentials with metadata
SELECT id, vic_username, vic_password, description, is_active, created_at
FROM vic_credentials
ORDER BY created_at DESC;
```

### Using Supabase REST API

```javascript
// Example: Fetch VIC credentials via Supabase client
const { data, error } = await supabase
  .from('vic_credentials')
  .select('vic_username, vic_password')
  .eq('is_active', true)
  .order('created_at', { ascending: false })
  .limit(1)
  .single();

if (data) {
  const { vic_username, vic_password } = data;
  // Use credentials for VIC API calls
}
```

### n8n Webhook Integration

If you're using n8n to automate VIC data synchronization:

1. Create a Supabase node in n8n
2. Query the `vic_credentials` table
3. Use the retrieved credentials in subsequent HTTP requests to VIC API

Example n8n workflow:
```
[Trigger] → [Supabase: Get VIC Credentials] → [HTTP Request: VIC API with credentials] → [Process Data]
```

## Rollback Instructions

If you need to rollback the changes:

### Database Rollback
```sql
-- 1. Add VIC columns back to farms
ALTER TABLE public.farms ADD COLUMN IF NOT EXISTS vic_username text;
ALTER TABLE public.farms ADD COLUMN IF NOT EXISTS vic_password text;

-- 2. Copy VIC credentials back from vic_credentials to farms
-- (Note: This assumes one credential set - adjust if you have multiple farms)
UPDATE public.farms f
SET 
  vic_username = (SELECT vic_username FROM vic_credentials WHERE is_active = true ORDER BY created_at DESC LIMIT 1),
  vic_password = (SELECT vic_password FROM vic_credentials WHERE is_active = true ORDER BY created_at DESC LIMIT 1)
WHERE EXISTS (SELECT 1 FROM vic_credentials WHERE is_active = true);

-- 3. Drop the vic_credentials table (optional)
DROP TABLE IF EXISTS public.vic_credentials CASCADE;
```

### Code Rollback
Use git to revert the changes:
```bash
git revert <commit-hash>
```

## Testing Checklist

- [ ] Database migrations applied successfully
- [ ] `vic_credentials` table created with proper columns and RLS policies
- [ ] VIC credentials migrated from farms to vic_credentials table
- [ ] Farm creation/editing works without VIC fields
- [ ] "VIC duomenys" button appears on module selector (visible to all users)
- [ ] VIC Credentials modal opens and closes correctly
- [ ] Admin users can view and edit VIC credentials
- [ ] Non-admin users can view credentials (if needed)
- [ ] Password visibility toggle works
- [ ] VIC credentials save successfully
- [ ] Description field is optional and works
- [ ] Multiple credential sets can be managed (one active at a time)
- [ ] n8n or external services can query vic_credentials table
- [ ] No console errors in browser
- [ ] No TypeScript compilation errors

## Security Considerations

### RLS Policies

The `vic_credentials` table has Row Level Security enabled:

- **Admins**: Full access (SELECT, INSERT, UPDATE, DELETE)
- **Authenticated users**: Read-only access to active credentials
- **Service role**: Full access (for n8n/automation)

### Password Storage

Currently, VIC passwords are stored as plain text. For production environments, consider:

1. **Application-level encryption**: Encrypt passwords before storing
2. **Supabase Vault**: Use Supabase's secret management (if available)
3. **Environment variables**: Store in secure environment variables for n8n
4. **Audit logging**: Track who accesses/modifies VIC credentials

## Support

If you encounter any issues during the migration, please:
1. Check the browser console for errors
2. Check the database logs for migration errors
3. Verify all migration files were applied in the correct order
4. Contact the development team for assistance
