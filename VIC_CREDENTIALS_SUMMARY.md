# VIC Credentials Refactoring - Complete Summary

## What Changed

### Overview
VIC (Veterinary Information Center) credentials have been moved from a per-farm model to an **organization-wide model** stored in a dedicated table.

### Before ❌
- VIC credentials stored in `farms` table
- Each farm had separate credentials
- Had to enter credentials for each farm individually
- Difficult to manage and update credentials across multiple farms

### After ✅
- VIC credentials stored in dedicated `vic_credentials` table
- **One set of credentials** applies to all farms and all users
- Centralized management via "VIC duomenys" button
- Easy to query for n8n automation
- Admin-controlled with proper RLS policies

---

## Database Changes

### New Table: `vic_credentials`

```sql
CREATE TABLE public.vic_credentials (
    id uuid PRIMARY KEY,
    vic_username text NOT NULL,           -- VIC username
    vic_password text NOT NULL,           -- VIC password  
    description text,                     -- Optional description
    is_active boolean DEFAULT true,       -- Active status
    created_at timestamptz,
    updated_at timestamptz,
    created_by uuid,                      -- Who created it
    updated_by uuid                       -- Who last updated it
);
```

### RLS Policies
- **Admins**: Full CRUD access
- **All authenticated users**: Read access to active credentials
- **Service role**: Full access (for n8n)

### Migrations
1. `20260607000001_create_vic_credentials_table.sql` - Creates the new table
2. `20260607000002_migrate_vic_data_to_vic_credentials_table.sql` - Migrates existing data
3. `20260607000003_remove_vic_credentials_from_farms.sql` - Cleans up old columns

---

## UI Changes

### 1. Module Selector (`src/components/ModuleSelector.tsx`)
- Added **"VIC duomenys"** button next to logout button
- Opens VIC credentials modal
- Accessible to all users (viewing), admins can edit

### 2. VIC Credentials Modal (`src/components/VICCredentials.tsx`)
**Features:**
- View/edit VIC username and password
- Optional description field
- Password visibility toggle
- Clear messaging: "Organizacijos lygmens duomenys"
- Save/Cancel functionality

### 3. Farms Component (`src/components/Farms.tsx`)
**Removed:**
- VIC credentials section from farm creation/editing forms
- VIC database operations
- VIC-related form fields

---

## Code Changes

### TypeScript Interfaces Updated
- ✅ `Farm` interface: Removed `vic_username`, `vic_password`
- ✅ `User` interface: No VIC fields (not per-user)
- ✅ New `VICCredential` interface in modal component

### Components Modified
1. `src/components/Farms.tsx` - Removed VIC fields
2. `src/components/ModuleSelector.tsx` - Added VIC button
3. `src/components/VICCredentials.tsx` - Refactored to use new table
4. `src/contexts/FarmContext.tsx` - Updated interface
5. `src/contexts/AuthContext.tsx` - No VIC in User interface

---

## n8n Integration

### How to Access VIC Credentials in n8n

**Method 1: Supabase Node (Recommended)**
```
Operation: Select rows
Table: vic_credentials
Filter: is_active = true
Limit: 1
Sort: created_at DESC
```

**Method 2: PostgreSQL Query**
```sql
SELECT vic_username, vic_password 
FROM vic_credentials 
WHERE is_active = true 
ORDER BY created_at DESC 
LIMIT 1;
```

**Method 3: REST API**
```
GET https://YOUR_PROJECT.supabase.co/rest/v1/vic_credentials?is_active=eq.true&order=created_at.desc&limit=1
```

### Use in Workflow
Access credentials in subsequent nodes:
- `{{ $json.vic_username }}`
- `{{ $json.vic_password }}`

See `N8N_VIC_INTEGRATION_GUIDE.md` for detailed examples.

---

## How to Deploy

### Step 1: Apply Migrations
```bash
# Using Supabase CLI
supabase db push

# Or apply via Supabase Dashboard SQL Editor
# Run each migration file in order (1, 2, 3)
```

### Step 2: Verify Migration
```sql
-- Check the new table exists
SELECT * FROM vic_credentials;

-- Verify credentials migrated
SELECT id, vic_username, description, is_active FROM vic_credentials;
```

### Step 3: Test the UI
1. Log in as admin
2. Click "VIC duomenys" button
3. View/edit credentials
4. Save and verify

### Step 4: Update n8n Workflows
- Update any n8n workflows that were querying farms table
- Point them to the new `vic_credentials` table
- Test the integration

---

## Files Created/Modified

### New Files
- ✅ `supabase/migrations/20260607000001_create_vic_credentials_table.sql`
- ✅ `supabase/migrations/20260607000002_migrate_vic_data_to_vic_credentials_table.sql`
- ✅ `supabase/migrations/20260607000003_remove_vic_credentials_from_farms.sql`
- ✅ `VIC_CREDENTIALS_MIGRATION.md` - Detailed migration guide
- ✅ `N8N_VIC_INTEGRATION_GUIDE.md` - n8n integration examples
- ✅ `n8n_vic_credentials_query.sql` - Quick SQL reference
- ✅ `VIC_CREDENTIALS_SUMMARY.md` - This file

### Modified Files
- ✅ `src/components/Farms.tsx` - Removed VIC fields
- ✅ `src/components/ModuleSelector.tsx` - Added VIC button
- ✅ `src/components/VICCredentials.tsx` - Refactored to use new table
- ✅ `src/contexts/FarmContext.tsx` - Updated Farm interface
- ✅ `src/contexts/AuthContext.tsx` - No VIC in User interface

---

## Benefits

### For Users
- ✅ Enter VIC credentials once, use everywhere
- ✅ Centralized management
- ✅ Simpler farm creation (no VIC fields)
- ✅ Clear organization-wide context

### For Administrators
- ✅ Single point of credential management
- ✅ Easy to update credentials across entire system
- ✅ Audit trail (created_by, updated_by)
- ✅ Can deactivate credentials without deleting

### For Developers/Automation
- ✅ Single table to query (`vic_credentials`)
- ✅ Clean data model
- ✅ RLS security built-in
- ✅ Easy n8n integration
- ✅ Service role access for automation

---

## Security Considerations

### Current Implementation
- ✅ RLS policies enabled
- ✅ Admin-only editing
- ✅ All users can view (needed for automation)
- ✅ Service role has full access

### Production Recommendations
1. **Encrypt passwords**: Add application-level encryption
2. **Rotate regularly**: Update VIC passwords periodically
3. **Audit access**: Track who views/updates credentials
4. **Secure n8n**: Ensure n8n instance is properly secured
5. **Environment separation**: Use different credentials for dev/staging/prod

---

## Testing Checklist

- [ ] Migrations applied successfully
- [ ] `vic_credentials` table created
- [ ] RLS policies working correctly
- [ ] Old VIC data migrated from farms
- [ ] "VIC duomenys" button visible on module selector
- [ ] Modal opens and loads credentials
- [ ] Admin can edit and save credentials
- [ ] Non-admin users can view credentials
- [ ] Password visibility toggle works
- [ ] Farm creation works without VIC fields
- [ ] n8n can query vic_credentials table
- [ ] Supabase REST API access works
- [ ] No TypeScript errors
- [ ] No console errors
- [ ] Dev server running without issues

---

## Rollback Plan

If you need to rollback:

```sql
-- 1. Restore VIC columns to farms
ALTER TABLE farms ADD COLUMN vic_username text;
ALTER TABLE farms ADD COLUMN vic_password text;

-- 2. Copy credentials back
UPDATE farms 
SET vic_username = (SELECT vic_username FROM vic_credentials WHERE is_active = true LIMIT 1),
    vic_password = (SELECT vic_password FROM vic_credentials WHERE is_active = true LIMIT 1);

-- 3. Drop new table (optional)
DROP TABLE vic_credentials CASCADE;
```

Then revert code changes via git.

---

## Support & Documentation

- **Migration Guide**: `VIC_CREDENTIALS_MIGRATION.md`
- **n8n Integration**: `N8N_VIC_INTEGRATION_GUIDE.md`
- **SQL Reference**: `n8n_vic_credentials_query.sql`
- **This Summary**: `VIC_CREDENTIALS_SUMMARY.md`

---

## Questions?

Common questions and answers:

**Q: Can we have multiple VIC accounts?**
A: Yes! The table supports multiple entries. Use `is_active` to designate which one is currently in use.

**Q: Who can edit VIC credentials?**
A: Only admin users can edit. All authenticated users can view active credentials.

**Q: How does n8n access the credentials?**
A: n8n uses the service_role key to query the `vic_credentials` table directly.

**Q: What if we need different credentials per farm?**
A: This is a design decision. If needed, you could add a `farm_id` column to `vic_credentials` table, but the current design is organization-wide by intention.

**Q: Are passwords encrypted?**
A: Currently stored as plain text. For production, implement application-level encryption.

---

## Next Steps

1. ✅ Apply the migrations
2. ✅ Test the UI changes
3. ✅ Update n8n workflows
4. ✅ Document any custom integrations
5. ✅ Train users on new VIC credentials management
6. ⏳ Consider implementing password encryption
7. ⏳ Set up credential rotation schedule

---

**Status**: ✅ Ready for deployment
**Date**: 2026-06-07
**Version**: 1.0
