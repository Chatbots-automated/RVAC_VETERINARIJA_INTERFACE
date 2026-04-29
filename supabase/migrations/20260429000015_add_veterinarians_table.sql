-- =====================================================================
-- Add Veterinarians Table and Link to Treatments
-- =====================================================================
-- Migration: 20260429000015
-- Created: 2026-04-29
--
-- OVERVIEW:
-- - Create veterinarians table to store veterinarian names
-- - Add veterinarian_id foreign key to treatments table
-- - Keep vet_name as fallback for free-text entry
-- - Migrate existing vet_name data to veterinarians table
-- =====================================================================

-- Create veterinarians table
CREATE TABLE IF NOT EXISTS public.veterinarians (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    name text NOT NULL,
    license_number text,
    phone text,
    email text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT veterinarians_name_unique UNIQUE (name)
);

COMMENT ON TABLE public.veterinarians IS 'List of veterinarians for dropdown selection in treatments';

-- Add veterinarian_id to treatments table
ALTER TABLE public.treatments
ADD COLUMN IF NOT EXISTS veterinarian_id uuid REFERENCES public.veterinarians(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.treatments.veterinarian_id IS 'Reference to veterinarians table. If NULL, vet_name is used as free-text.';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_treatments_veterinarian_id ON public.treatments(veterinarian_id);

-- Migrate existing vet_name data to veterinarians table
-- This will create veterinarian records from unique existing names
INSERT INTO public.veterinarians (name)
SELECT DISTINCT vet_name
FROM public.treatments
WHERE vet_name IS NOT NULL 
  AND vet_name != '' 
  AND vet_name != 'Nenurodyta'
ON CONFLICT (name) DO NOTHING;

-- Optional: Link existing treatments to the newly created veterinarians
-- This updates treatments to reference the veterinarian_id instead of just vet_name
UPDATE public.treatments t
SET veterinarian_id = v.id
FROM public.veterinarians v
WHERE t.vet_name = v.name
  AND t.veterinarian_id IS NULL;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON public.veterinarians TO authenticated;

-- Add RLS policies
ALTER TABLE public.veterinarians ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Veterinarians are viewable by authenticated users"
    ON public.veterinarians FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Veterinarians are insertable by authenticated users"
    ON public.veterinarians FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Veterinarians are updatable by authenticated users"
    ON public.veterinarians FOR UPDATE
    TO authenticated
    USING (true);
