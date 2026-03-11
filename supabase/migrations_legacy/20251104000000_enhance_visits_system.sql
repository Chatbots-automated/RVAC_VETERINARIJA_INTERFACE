/*
  # Enhanced Visits System

  ## Overview
  Complete restructure of the visits system to support comprehensive veterinary workflows
  including procedures, temperature tracking, visit scheduling, and treatment linkage.

  ## Changes

  1. **Drop and Recreate animal_visits table**
     - Add `visit_datetime` (timestamptz) - Full date and time of visit
     - Add `procedures` (text[]) - Array of procedures: Temp., Apžiūra, Profilaktika, Gydymas, Vakcina, Kita
     - Add `temperature` (decimal) - Animal temperature if measured
     - Add `temperature_measured_at` (timestamptz) - When temperature was measured
     - Add `status` (text) - Planuojamas, Vykdomas, Baigtas, Atšauktas, Neįvykęs
     - Add `notes` (text) - Visit notes
     - Add `vet_name` (text) - Veterinarian name
     - Add `next_visit_required` (boolean) - Whether follow-up visit needed
     - Add `next_visit_date` (timestamptz) - When next visit should occur
     - Add `treatment_required` (boolean) - Whether treatment needed
     - Remove old fields that are no longer needed

  2. **Add visit_id to treatments table**
     - Link treatments to visits for better tracking
     - Add foreign key constraint

  3. **Create view for animal visit summaries**
     - Show next visit and last visit for each animal
     - Used in Animals table display

  4. **Security**
     - Enable RLS on all tables
     - Add policies for authenticated users

  5. **Indexes**
     - Add indexes for performance on visit_datetime, status, animal_id
*/

-- Drop existing animal_visits table and recreate with new structure
DROP TABLE IF EXISTS public.animal_visits CASCADE;

CREATE TABLE public.animal_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  animal_id uuid NOT NULL REFERENCES public.animals(id) ON DELETE CASCADE,
  visit_datetime timestamptz NOT NULL,
  procedures text[] NOT NULL DEFAULT '{}',
  temperature decimal(4,1) NULL,
  temperature_measured_at timestamptz NULL,
  status text NOT NULL DEFAULT 'Planuojamas' CHECK (status IN ('Planuojamas', 'Vykdomas', 'Baigtas', 'Atšauktas', 'Neįvykęs')),
  notes text,
  vet_name text,
  next_visit_required boolean DEFAULT false,
  next_visit_date timestamptz NULL,
  treatment_required boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add visit_id to treatments table if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'treatments' AND column_name = 'visit_id'
  ) THEN
    ALTER TABLE public.treatments ADD COLUMN visit_id uuid REFERENCES public.animal_visits(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Enable RLS
ALTER TABLE public.animal_visits ENABLE ROW LEVEL SECURITY;

-- Policies for animal_visits
CREATE POLICY "Users can read visits"
  ON public.animal_visits
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert visits"
  ON public.animal_visits
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update visits"
  ON public.animal_visits
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete visits"
  ON public.animal_visits
  FOR DELETE
  TO authenticated
  USING (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_animal_visits_animal_id ON public.animal_visits(animal_id);
CREATE INDEX IF NOT EXISTS idx_animal_visits_datetime ON public.animal_visits(visit_datetime);
CREATE INDEX IF NOT EXISTS idx_animal_visits_status ON public.animal_visits(status);
CREATE INDEX IF NOT EXISTS idx_treatments_visit_id ON public.treatments(visit_id);

-- Create view for animal visit summaries
CREATE OR REPLACE VIEW public.animal_visit_summary AS
SELECT
  a.id as animal_id,
  a.tag_no,
  a.species,
  (
    SELECT visit_datetime
    FROM public.animal_visits av
    WHERE av.animal_id = a.id
      AND av.visit_datetime > now()
      AND av.status IN ('Planuojamas', 'Vykdomas')
    ORDER BY av.visit_datetime ASC
    LIMIT 1
  ) as next_visit,
  (
    SELECT visit_datetime
    FROM public.animal_visits av
    WHERE av.animal_id = a.id
      AND av.visit_datetime <= now()
    ORDER BY av.visit_datetime DESC
    LIMIT 1
  ) as last_visit
FROM public.animals a;

-- Add updated_at trigger for animal_visits
DROP TRIGGER IF EXISTS set_updated_at_animal_visits ON public.animal_visits;
CREATE TRIGGER set_updated_at_animal_visits
  BEFORE UPDATE ON public.animal_visits
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
