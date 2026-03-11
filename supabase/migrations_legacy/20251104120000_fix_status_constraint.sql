/*
  # Fix Animal Visits Status Constraint

  1. Changes
    - Drop old status check constraint
    - Add new constraint with correct Lithuanian status values
    - Values: 'Planuojamas', 'Užbaigtas', 'Atšauktas'

  2. Security
    - No changes to RLS policies
*/

-- Drop the old constraint if it exists
ALTER TABLE animal_visits DROP CONSTRAINT IF EXISTS animal_visits_status_check;

-- Add the correct constraint with proper Lithuanian values
ALTER TABLE animal_visits ADD CONSTRAINT animal_visits_status_check
  CHECK (status IN ('Planuojamas', 'Užbaigtas', 'Atšauktas'));
