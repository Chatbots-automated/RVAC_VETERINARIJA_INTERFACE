-- Clear all GEA data from all tables
-- This will delete everything and let you start fresh

-- Delete all data from the three ataskaita tables
-- (CASCADE will handle this automatically when we delete from imports)
DELETE FROM public.gea_daily_ataskaita1;
DELETE FROM public.gea_daily_ataskaita2;
DELETE FROM public.gea_daily_ataskaita3;

-- Delete all imports (this will cascade delete to ataskaita tables due to foreign keys)
DELETE FROM public.gea_daily_imports;

-- Verify everything is empty
SELECT 'gea_daily_imports' as table_name, COUNT(*) as row_count FROM public.gea_daily_imports
UNION ALL
SELECT 'gea_daily_ataskaita1', COUNT(*) FROM public.gea_daily_ataskaita1
UNION ALL
SELECT 'gea_daily_ataskaita2', COUNT(*) FROM public.gea_daily_ataskaita2
UNION ALL
SELECT 'gea_daily_ataskaita3', COUNT(*) FROM public.gea_daily_ataskaita3
UNION ALL
SELECT 'gea_daily_cows_joined (view)', COUNT(*) FROM public.gea_daily_cows_joined;

-- All counts should be 0
