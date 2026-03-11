/*
  # Add Teat Tracking and Recurring Treatment Support

  1. Updates
    - Add `teat` column to `usage_items` table
      - Tracks which teat was treated: d1, d2, k1, k2
      - d = right (dešinė), k = left (kairė)
      - NULL allowed for non-teat treatments

    - Add `teat` column to `treatment_courses` table
      - Same as usage_items for course treatments

    - Add `creates_future_visits` boolean to `treatments` table
      - Indicates if this treatment created future planned visits

    - Add `related_treatment_id` to `animal_visits` table
      - Links future visits back to the original treatment

  2. Important Notes
    - Teat values: d1, d2, k1, k2 (or NULL)
    - d1/d2 = right udder (dešinė)
    - k1/k2 = left udder (kairė)
    - When a treatment with recurring days is created, it will create planned visits
    - These visits will be linked to the original treatment
*/

-- Add teat column to usage_items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'usage_items' AND column_name = 'teat'
  ) THEN
    ALTER TABLE usage_items ADD COLUMN teat text CHECK (teat IN ('d1', 'd2', 'k1', 'k2'));
  END IF;
END $$;

-- Add teat column to treatment_courses
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'treatment_courses' AND column_name = 'teat'
  ) THEN
    ALTER TABLE treatment_courses ADD COLUMN teat text CHECK (teat IN ('d1', 'd2', 'k1', 'k2'));
  END IF;
END $$;

-- Add creates_future_visits to treatments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'treatments' AND column_name = 'creates_future_visits'
  ) THEN
    ALTER TABLE treatments ADD COLUMN creates_future_visits boolean DEFAULT false;
  END IF;
END $$;

-- Add related_treatment_id to animal_visits
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'animal_visits' AND column_name = 'related_treatment_id'
  ) THEN
    ALTER TABLE animal_visits ADD COLUMN related_treatment_id uuid REFERENCES treatments(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create index for faster lookups of treatment-related visits
CREATE INDEX IF NOT EXISTS idx_animal_visits_related_treatment
  ON animal_visits(related_treatment_id) WHERE related_treatment_id IS NOT NULL;
