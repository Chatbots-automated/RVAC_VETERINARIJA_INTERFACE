-- =============================================================================
-- SIMPLE FIX - Just add indexes and increase timeout
-- =============================================================================
-- Stop overcomplicating. The views work, they just need indexes and more time.
-- =============================================================================

-- Add indexes on the base tables that gea_daily_cows_joined uses
CREATE INDEX IF NOT EXISTS idx_gea_ataskaita1_ear_number 
  ON gea_daily_ataskaita1(ear_number);

CREATE INDEX IF NOT EXISTS idx_gea_ataskaita1_import_id 
  ON gea_daily_ataskaita1(import_id);

CREATE INDEX IF NOT EXISTS idx_gea_ataskaita2_cow_number 
  ON gea_daily_ataskaita2(cow_number);

CREATE INDEX IF NOT EXISTS idx_gea_ataskaita2_import_id 
  ON gea_daily_ataskaita2(import_id);

CREATE INDEX IF NOT EXISTS idx_gea_ataskaita2_milk 
  ON gea_daily_ataskaita2(avg_milk_prod_weight) 
  WHERE avg_milk_prod_weight IS NOT NULL AND avg_milk_prod_weight > 0;

CREATE INDEX IF NOT EXISTS idx_gea_ataskaita3_cow_number 
  ON gea_daily_ataskaita3(cow_number);

CREATE INDEX IF NOT EXISTS idx_gea_ataskaita3_import_id 
  ON gea_daily_ataskaita3(import_id);

CREATE INDEX IF NOT EXISTS idx_gea_imports_created_at 
  ON gea_daily_imports(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_treatments_animal_id 
  ON treatments(animal_id);

CREATE INDEX IF NOT EXISTS idx_treatments_withdrawal 
  ON treatments(withdrawal_until_milk) 
  WHERE withdrawal_until_milk IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_animal_synchronizations_animal 
  ON animal_synchronizations(animal_id);

CREATE INDEX IF NOT EXISTS idx_animal_synchronizations_start 
  ON animal_synchronizations(start_date);

CREATE INDEX IF NOT EXISTS idx_synchronization_steps_sync 
  ON synchronization_steps(synchronization_id);

CREATE INDEX IF NOT EXISTS idx_animals_tag_no 
  ON animals(tag_no);

-- Fix RLS policies for system_settings
DROP POLICY IF EXISTS "Allow anon to read settings" ON system_settings;
CREATE POLICY "Allow anon to read settings" 
  ON system_settings FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Allow service_role to read settings" ON system_settings;
CREATE POLICY "Allow service_role to read settings" 
  ON system_settings FOR SELECT TO service_role USING (true);

-- Increase statement timeout for these specific views
-- Set it at the database level for PostgREST queries
ALTER ROLE authenticator SET statement_timeout = '120s';
ALTER ROLE anon SET statement_timeout = '120s';
ALTER ROLE authenticated SET statement_timeout = '120s';

-- Analyze tables to update statistics for better query planning
ANALYZE gea_daily_ataskaita1;
ANALYZE gea_daily_ataskaita2;
ANALYZE gea_daily_ataskaita3;
ANALYZE gea_daily_imports;
ANALYZE treatments;
ANALYZE animals;
ANALYZE animal_synchronizations;
ANALYZE synchronization_steps;
