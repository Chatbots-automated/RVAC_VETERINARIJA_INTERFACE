-- =====================================================================
-- MIGRATE VIC CREDENTIALS FROM FARMS TO VIC_CREDENTIALS TABLE
-- =====================================================================
-- This migration transfers existing VIC credentials from farms table
-- to the new organization-wide vic_credentials table

DO $$
DECLARE
    farm_record RECORD;
    credential_exists boolean;
    vic_columns_exist boolean;
BEGIN
    -- Check if vic_username and vic_password columns exist in farms table
    SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'farms' 
        AND column_name = 'vic_username'
    ) INTO vic_columns_exist;

    -- Only proceed if the columns exist
    IF vic_columns_exist THEN
        RAISE NOTICE 'VIC columns found in farms table, starting migration...';
        
        -- For each farm with VIC credentials, create an entry in vic_credentials table
        FOR farm_record IN 
            SELECT DISTINCT vic_username, vic_password, name
            FROM public.farms
            WHERE vic_username IS NOT NULL 
            AND vic_password IS NOT NULL
            AND vic_username != ''
            AND vic_password != ''
        LOOP
            -- Check if this credential combination already exists
            SELECT EXISTS(
                SELECT 1 FROM public.vic_credentials
                WHERE vic_username = farm_record.vic_username
                AND vic_password = farm_record.vic_password
            ) INTO credential_exists;

            -- Only insert if it doesn't exist
            IF NOT credential_exists THEN
                INSERT INTO public.vic_credentials (
                    vic_username,
                    vic_password,
                    is_active,
                    created_at,
                    updated_at
                ) VALUES (
                    farm_record.vic_username,
                    farm_record.vic_password,
                    true,
                    now(),
                    now()
                );
                
                RAISE NOTICE 'Migrated VIC credentials from farm: %', farm_record.name;
            ELSE
                RAISE NOTICE 'VIC credentials already exist for farm: %, skipping', farm_record.name;
            END IF;
        END LOOP;
        
        RAISE NOTICE 'VIC credentials migration completed';
    ELSE
        RAISE NOTICE 'VIC columns not found in farms table - nothing to migrate (this is OK if they were already removed)';
    END IF;
END $$;
