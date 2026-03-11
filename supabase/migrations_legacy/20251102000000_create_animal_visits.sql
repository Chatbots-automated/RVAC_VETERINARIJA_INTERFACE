/*
  # Create Animal Visits Table

  1. New Tables
    - `animal_visits`
      - `id` (uuid, primary key)
      - `animal_id` (uuid, foreign key to animals)
      - `visit_date` (date) - When the visit is scheduled or occurred
      - `visit_type` (text) - Type of visit (checkup, vaccination, treatment, follow-up, emergency)
      - `status` (text) - Status (scheduled, completed, cancelled)
      - `purpose` (text) - Purpose/reason for the visit
      - `notes` (text) - Additional notes
      - `vet_name` (text) - Name of veterinarian
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `animal_visits` table
    - Add policies for authenticated users to manage visits

  3. Indexes
    - Index on animal_id for fast lookups
    - Index on visit_date for date-based queries
    - Index on status for filtering by status
*/

-- Create animal_visits table
CREATE TABLE IF NOT EXISTS public.animal_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  animal_id uuid NOT NULL REFERENCES public.animals(id) ON DELETE CASCADE,
  visit_date date NOT NULL,
  visit_type text NOT NULL CHECK (visit_type IN ('checkup', 'vaccination', 'treatment', 'follow-up', 'emergency', 'other')),
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  purpose text,
  notes text,
  vet_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.animal_visits ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read visits
CREATE POLICY "Users can read visits"
  ON public.animal_visits
  FOR SELECT
  USING (true);

-- Policy: Users can insert visits
CREATE POLICY "Users can insert visits"
  ON public.animal_visits
  FOR INSERT
  WITH CHECK (true);

-- Policy: Users can update visits
CREATE POLICY "Users can update visits"
  ON public.animal_visits
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Policy: Users can delete visits
CREATE POLICY "Users can delete visits"
  ON public.animal_visits
  FOR DELETE
  USING (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_animal_visits_animal_id ON public.animal_visits(animal_id);
CREATE INDEX IF NOT EXISTS idx_animal_visits_date ON public.animal_visits(visit_date);
CREATE INDEX IF NOT EXISTS idx_animal_visits_status ON public.animal_visits(status);

-- Add updated_at trigger
DROP TRIGGER IF EXISTS set_updated_at_animal_visits ON public.animal_visits;
CREATE TRIGGER set_updated_at_animal_visits
  BEFORE UPDATE ON public.animal_visits
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
