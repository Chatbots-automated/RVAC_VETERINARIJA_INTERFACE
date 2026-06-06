-- =====================================================================
-- VIC CREDENTIALS QUERY FOR N8N AUTOMATION
-- =====================================================================
-- Use this query in your n8n workflows to fetch VIC credentials
-- for automated data synchronization with VIC (Veterinary Information Center)

-- Get the active VIC credentials (most commonly used)
SELECT 
    id,
    vic_username,
    vic_password,
    description,
    is_active,
    created_at,
    updated_at
FROM public.vic_credentials
WHERE is_active = true
ORDER BY created_at DESC
LIMIT 1;

-- =====================================================================
-- ALTERNATIVE QUERIES
-- =====================================================================

-- Get all VIC credentials (including inactive)
SELECT 
    id,
    vic_username,
    vic_password,
    description,
    is_active,
    created_at,
    updated_at
FROM public.vic_credentials
ORDER BY is_active DESC, created_at DESC;

-- Get just username and password (minimal query)
SELECT 
    vic_username,
    vic_password
FROM public.vic_credentials
WHERE is_active = true
ORDER BY created_at DESC
LIMIT 1;

-- =====================================================================
-- N8N SUPABASE NODE CONFIGURATION
-- =====================================================================
-- 1. Add a Supabase node to your n8n workflow
-- 2. Configure connection with your Supabase URL and service_role key
-- 3. Operation: Select rows
-- 4. Table: vic_credentials
-- 5. Filters:
--    - is_active = true
-- 6. Sort: created_at DESC
-- 7. Limit: 1
-- 
-- Then use the returned vic_username and vic_password in subsequent nodes
