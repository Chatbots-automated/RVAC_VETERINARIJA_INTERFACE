-- Fix created_by foreign key constraints for farm_equipment tables
-- This removes the strict FK constraint to auth.users which might be causing issues
-- Run this ONLY if you still get RLS errors after running the RLS policies fix

-- Drop the foreign key constraints on created_by and performed_by
ALTER TABLE public.farm_equipment 
  DROP CONSTRAINT IF EXISTS farm_equipment_created_by_fkey;

ALTER TABLE public.farm_equipment_items 
  DROP CONSTRAINT IF EXISTS farm_equipment_items_created_by_fkey;

ALTER TABLE public.farm_equipment_service_records 
  DROP CONSTRAINT IF EXISTS farm_equipment_service_records_performed_by_fkey;

-- Verify the constraints were dropped
SELECT conname, conrelid::regclass AS table_name, confrelid::regclass AS referenced_table
FROM pg_constraint
WHERE conrelid IN (
  'public.farm_equipment'::regclass,
  'public.farm_equipment_items'::regclass,
  'public.farm_equipment_service_records'::regclass
)
AND contype = 'f'
AND (conname LIKE '%created_by%' OR conname LIKE '%performed_by%');

-- The created_by and performed_by columns will remain as uuid fields
-- but without the strict foreign key constraint
-- This allows flexibility while still storing user IDs
