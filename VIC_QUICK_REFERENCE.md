# Quick Reference: VIC Credentials

## 🎯 What This Is

Organization-wide VIC (Veterinary Information Center) credentials that apply to all farms and all users.

## 📍 Where It's Stored

**Database Table**: `vic_credentials`

```sql
-- Get active VIC credentials
SELECT vic_username, vic_password 
FROM vic_credentials 
WHERE is_active = true 
LIMIT 1;
```

## 🖥️ How Users Access It

1. Go to module selector (after login)
2. Click **"VIC duomenys"** button (next to logout button)
3. View/edit credentials (admins only can edit)

## 🤖 How n8n Accesses It

### Supabase Node
- Table: `vic_credentials`
- Filter: `is_active = true`
- Limit: 1

### Use in workflows
```javascript
{{ $json.vic_username }}
{{ $json.vic_password }}
```

## 📋 File Locations

### Database Migrations
- `supabase/migrations/20260607000001_create_vic_credentials_table.sql`
- `supabase/migrations/20260607000002_migrate_vic_data_to_vic_credentials_table.sql`
- `supabase/migrations/20260607000003_remove_vic_credentials_from_farms.sql`

### UI Components
- `src/components/VICCredentials.tsx` - The modal
- `src/components/ModuleSelector.tsx` - The button
- `src/components/Farms.tsx` - VIC fields removed

### Documentation
- `VIC_CREDENTIALS_SUMMARY.md` - Complete overview
- `VIC_CREDENTIALS_MIGRATION.md` - Migration guide
- `N8N_VIC_INTEGRATION_GUIDE.md` - n8n integration examples
- `n8n_vic_credentials_query.sql` - SQL queries

## ✅ Deploy Steps

1. Apply migrations: `supabase db push`
2. Test UI: Click "VIC duomenys" button
3. Update n8n workflows if needed

## 🔐 Security

- **RLS enabled**: Yes
- **Admins**: Full access
- **Users**: Read-only access
- **Service role**: Full access (for automation)

## 💡 Key Points

- ✅ One set of credentials for entire organization
- ✅ All farms use the same credentials
- ✅ Easy to update (change once, affects all)
- ✅ n8n-friendly (single table query)
- ✅ No per-farm or per-user credentials needed

## 📞 Support

Issues? Check:
1. Supabase dashboard → SQL Editor → `SELECT * FROM vic_credentials;`
2. Browser console for errors
3. n8n execution logs
4. Documentation files listed above
