-- =====================================================================
-- CREATE VIC CREDENTIALS TABLE
-- =====================================================================
-- This migration creates a dedicated table for VIC (Veterinary Information Center)
-- credentials that are shared across all farms and users in the organization

-- Create vic_credentials table
CREATE TABLE IF NOT EXISTS public.vic_credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    vic_username text NOT NULL,
    vic_password text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid
);

COMMENT ON TABLE public.vic_credentials IS 'Organization-wide VIC (Veterinary Information Center) credentials shared across all farms and users';
COMMENT ON COLUMN public.vic_credentials.vic_username IS 'VIC username for automated data sync';
COMMENT ON COLUMN public.vic_credentials.vic_password IS 'VIC password (should be encrypted at application level in production)';
COMMENT ON COLUMN public.vic_credentials.is_active IS 'Whether this VIC credential set is currently active';

-- Disable RLS for vic_credentials table
-- This app uses custom authentication (not Supabase Auth), so RLS policies with auth.uid() don't work
-- Security is handled at the application level
ALTER TABLE public.vic_credentials DISABLE ROW LEVEL SECURITY;

-- Drop foreign key constraints if they exist (for existing installations)
DO $$ 
BEGIN
    ALTER TABLE public.vic_credentials DROP CONSTRAINT IF EXISTS vic_credentials_created_by_fkey;
    ALTER TABLE public.vic_credentials DROP CONSTRAINT IF EXISTS vic_credentials_updated_by_fkey;
    RAISE NOTICE 'Dropped foreign key constraints from vic_credentials table';
EXCEPTION
    WHEN OTHERS THEN 
        RAISE NOTICE 'No foreign key constraints to drop';
END $$;

-- Create the update_updated_at_column function if it doesn't exist
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if it exists, then create it
DROP TRIGGER IF EXISTS set_vic_credentials_updated_at ON public.vic_credentials;

-- Create updated_at trigger
CREATE TRIGGER set_vic_credentials_updated_at
    BEFORE UPDATE ON public.vic_credentials
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
