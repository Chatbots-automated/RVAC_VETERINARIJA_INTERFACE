/*
  # Comprehensive Teat Tracking System

  1. New Tables
    - `teat_status`
      - `id` (uuid, primary key)
      - `animal_id` (uuid, references animals)
      - `teat_position` (text: 'd1', 'd2', 'k1', 'k2')
      - `is_disabled` (boolean, default false)
      - `disabled_date` (date, nullable)
      - `disabled_reason` (text, nullable)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Updates to Existing Tables
    - Add `affected_teats` JSONB column to `treatments` table
      - Stores array of teat positions that were treated: ['d1', 'k2', etc]
    - Add `sick_teats` JSONB column to `treatments` table
      - Stores array of teat positions that are sick during treatment

  3. Security
    - Enable RLS on `teat_status` table
    - Add policies for authenticated users to manage teat status

  4. Important Notes
    - Teat positions: d1, d2 (right/dešinė), k1, k2 (left/kairė)
    - Each animal can have 0-4 disabled teats tracked
    - Treatments can affect multiple teats simultaneously
    - Sick teats are tracked per treatment for historical purposes
*/

-- Create teat_status table for tracking disabled teats
CREATE TABLE IF NOT EXISTS teat_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  animal_id uuid REFERENCES animals(id) ON DELETE CASCADE NOT NULL,
  teat_position text NOT NULL CHECK (teat_position IN ('d1', 'd2', 'k1', 'k2')),
  is_disabled boolean DEFAULT false,
  disabled_date date,
  disabled_reason text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(animal_id, teat_position)
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_teat_status_animal_id ON teat_status(animal_id);
CREATE INDEX IF NOT EXISTS idx_teat_status_disabled ON teat_status(is_disabled) WHERE is_disabled = true;

-- Add affected_teats column to treatments table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'treatments' AND column_name = 'affected_teats'
  ) THEN
    ALTER TABLE treatments ADD COLUMN affected_teats jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Add sick_teats column to treatments table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'treatments' AND column_name = 'sick_teats'
  ) THEN
    ALTER TABLE treatments ADD COLUMN sick_teats jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Enable RLS on teat_status table
ALTER TABLE teat_status ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users can view all teat status
CREATE POLICY "Authenticated users can view teat status"
  ON teat_status FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Authenticated users can insert teat status
CREATE POLICY "Authenticated users can insert teat status"
  ON teat_status FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy: Authenticated users can update teat status
CREATE POLICY "Authenticated users can update teat status"
  ON teat_status FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Policy: Authenticated users can delete teat status
CREATE POLICY "Authenticated users can delete teat status"
  ON teat_status FOR DELETE
  TO authenticated
  USING (true);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_teat_status_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS teat_status_updated_at ON teat_status;
CREATE TRIGGER teat_status_updated_at
  BEFORE UPDATE ON teat_status
  FOR EACH ROW
  EXECUTE FUNCTION update_teat_status_updated_at();
