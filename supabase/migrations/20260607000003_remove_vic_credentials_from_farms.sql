-- =====================================================================
-- REMOVE VIC CREDENTIALS FROM FARMS TABLE
-- =====================================================================
-- This migration removes VIC credentials from the farms table after
-- they have been migrated to the vic_credentials table
-- Run this AFTER verifying the data migration was successful

-- Remove VIC credentials columns from farms table
DO $$ 
BEGIN
    ALTER TABLE public.farms DROP COLUMN IF EXISTS vic_username;
    RAISE NOTICE 'Dropped vic_username column from farms table';
EXCEPTION
    WHEN undefined_column THEN 
        RAISE NOTICE 'Column vic_username does not exist in farms table';
END $$;

DO $$ 
BEGIN
    ALTER TABLE public.farms DROP COLUMN IF EXISTS vic_password;
    RAISE NOTICE 'Dropped vic_password column from farms table';
EXCEPTION
    WHEN undefined_column THEN 
        RAISE NOTICE 'Column vic_password does not exist in farms table';
END $$;
