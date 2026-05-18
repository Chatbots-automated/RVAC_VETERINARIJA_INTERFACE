-- =====================================================================
-- Add 'tabletė' Unit Type (Part 1 of 2)
-- =====================================================================
-- Issue: Database has 'tablet' (English) but TypeScript and UI use 'tabletė' (Lithuanian)
-- This migration adds the new enum value.
-- A second migration will update existing records.
-- =====================================================================

-- Add the new value 'tabletė' to the enum
ALTER TYPE public.unit ADD VALUE IF NOT EXISTS 'tabletė';

-- Add comment
COMMENT ON TYPE public.unit IS 
'Product units: ml, l, g, kg, vnt, pcs, tablet, tabletė, bolus, syringe (tablet is deprecated, use tabletė)';
