-- =====================================================================
-- FIX VIC CREDENTIALS RLS - DISABLE RLS
-- =====================================================================
-- This fixes the RLS policy error by disabling RLS for vic_credentials
-- The app uses custom authentication, not Supabase Auth, so auth.uid() is always NULL
-- Security is handled at the application level

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Admins can manage VIC credentials" ON public.vic_credentials;
DROP POLICY IF EXISTS "Authenticated users can view active VIC credentials" ON public.vic_credentials;

-- Disable RLS for this table
ALTER TABLE public.vic_credentials DISABLE ROW LEVEL SECURITY;

-- Drop description column if it exists (we removed it from the design)
DO $$ 
BEGIN
    ALTER TABLE public.vic_credentials DROP COLUMN IF EXISTS description;
    RAISE NOTICE 'Dropped description column from vic_credentials table';
EXCEPTION
    WHEN undefined_column THEN 
        RAISE NOTICE 'Column description does not exist in vic_credentials table';
END $$;

-- Drop foreign key constraints (for custom auth compatibility)
DO $$ 
BEGIN
    ALTER TABLE public.vic_credentials DROP CONSTRAINT IF EXISTS vic_credentials_created_by_fkey;
    ALTER TABLE public.vic_credentials DROP CONSTRAINT IF EXISTS vic_credentials_updated_by_fkey;
    RAISE NOTICE 'Dropped foreign key constraints from vic_credentials table';
EXCEPTION
    WHEN OTHERS THEN 
        RAISE NOTICE 'No foreign key constraints to drop';
END $$;
