-- =====================================================================
-- Migrate 'tablet' to 'tabletė' (Part 2 of 2)
-- =====================================================================
-- This migration updates all existing 'tablet' records to 'tabletė'
-- Must be run AFTER 20260518000002_add_tablete_unit.sql
-- =====================================================================

-- Update any existing records that use 'tablet' to 'tabletė'
UPDATE public.products SET primary_pack_unit = 'tabletė' WHERE primary_pack_unit = 'tablet';
UPDATE public.usage_items SET unit = 'tabletė' WHERE unit = 'tablet';
UPDATE public.vaccinations SET unit = 'tabletė' WHERE unit = 'tablet';
UPDATE public.treatment_courses SET unit = 'tabletė' WHERE unit = 'tablet';
UPDATE public.course_doses SET unit = 'tabletė' WHERE unit = 'tablet';

-- Update comment to remove deprecated reference
COMMENT ON TYPE public.unit IS 
'Product units: ml, l, g, kg, vnt, pcs, tabletė, bolus, syringe';
