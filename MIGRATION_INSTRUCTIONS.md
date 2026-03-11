# Database Migration Instructions

## Quick Fix for Work Descriptions RLS Error

The work descriptions feature needs database changes. Follow these steps:

### Step 1: Apply Database Changes

1. Go to your **Supabase Dashboard**: https://supabase.com/dashboard
2. Select your project
3. Click on **SQL Editor** in the left sidebar
4. Click **New Query**
5. Copy the entire contents of `APPLY_MIGRATIONS.sql` file
6. Paste it into the SQL editor
7. Click **Run** (or press Ctrl+Enter)

### Step 2: Verify

After running the SQL, you should see:
- ✅ `work_descriptions` table created
- ✅ RLS policies applied
- ✅ Default work descriptions inserted
- ✅ `users.requires_login` column added

### Step 3: Test

1. Refresh your application
2. Go to **Darbuotojai** → **Surašyti iš lapų**
3. Click on **Matavimo vienetai** tab
4. Try adding a new work description - it should work now! ✅

## What Changed?

### 1. Work Descriptions Table
- Stores user-created work descriptions for vairuotojas and traktorininkas
- Includes default descriptions for common tasks
- Full RLS security enabled

### 2. Users Table
- Added `requires_login` column
- Allows creating workers who don't need login credentials
- Perfect for schedule-only workers

## Troubleshooting

If you still get RLS errors:
1. Make sure you're logged in as an admin user
2. Check that the SQL ran without errors
3. Try logging out and back in
4. Clear browser cache and reload

## Need Help?

The migrations are also in the `supabase/migrations/` folder:
- `20260304000003_add_work_descriptions.sql`
- `20260304000004_add_no_login_users.sql`
- `20260304000005_fix_work_descriptions_rls.sql`
