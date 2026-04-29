-- =====================================================================
-- Make Notepad ALWAYS Global
-- =====================================================================
-- Migration: 20260429000006
-- Created: 2026-04-29
--
-- OVERVIEW:
-- Makes the shared notepad ALWAYS global (not tied to any specific farm).
-- The notepad is visible everywhere - in all modules, all farms.
-- farm_id is made nullable and should ALWAYS be NULL for the global notepad.
-- =====================================================================

-- Make farm_id nullable to allow global notepads
ALTER TABLE public.shared_notepad
ALTER COLUMN farm_id DROP NOT NULL;

-- Update comment to reflect ALWAYS GLOBAL behavior
COMMENT ON TABLE public.shared_notepad IS 'ALWAYS GLOBAL shared notepad visible in all modules and all farms. farm_id should ALWAYS be NULL.';

-- Update index to handle NULL values
DROP INDEX IF EXISTS idx_shared_notepad_farm_id;
DROP INDEX IF EXISTS idx_shared_notepad_global;
CREATE INDEX idx_shared_notepad_farm_id ON public.shared_notepad (farm_id) WHERE farm_id IS NOT NULL;
CREATE INDEX idx_shared_notepad_global ON public.shared_notepad ((farm_id IS NULL)) WHERE farm_id IS NULL;
