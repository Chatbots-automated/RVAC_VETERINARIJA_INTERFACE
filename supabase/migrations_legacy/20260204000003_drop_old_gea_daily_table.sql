-- Drop old gea_daily table and force migration to new GEA system
-- This will remove the legacy table and all its dependencies

-- Drop the old gea_daily table with CASCADE to remove all dependencies
DROP TABLE IF EXISTS gea_daily CASCADE;

-- Note: This will also drop:
-- - Any foreign key constraints referencing gea_daily
-- - Any indexes on gea_daily
-- - Any triggers on gea_daily
-- - Any views that depend on gea_daily

-- The new GEA system uses these tables instead:
-- - gea_daily_imports (import metadata)
-- - gea_daily_ataskaita1 (pregnancy/lactation data)
-- - gea_daily_ataskaita2 (milking data)
-- - gea_daily_ataskaita3 (teat/breeding data)
-- - gea_daily_cows_joined (view joining all three ataskaita tables)

-- After running this migration:
-- 1. The old gea_daily table will be gone
-- 2. You MUST use gea_daily_upload() RPC to import GEA data
-- 3. The frontend will only show the new 3-tab interface
-- 4. No more legacy "GEA Duomenys (Legacy)" view

COMMENT ON SCHEMA public IS 'Old gea_daily table dropped on 2026-02-04. Use new GEA system with gea_daily_upload() RPC.';
