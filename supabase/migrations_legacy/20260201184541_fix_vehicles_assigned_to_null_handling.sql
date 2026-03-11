/*
  # Fix Vehicles Assigned To Foreign Key Constraint

  ## Changes
  
  1. Ensure assigned_to field properly handles NULL values
  2. Make the foreign key constraint allow NULL values (ON DELETE SET NULL)
  
  This fixes the error: "insert or update on table vehicles violates foreign key constraint vehicles_assigned_to_fkey"
*/

-- Drop existing constraint if it exists
ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_assigned_to_fkey;

-- Recreate the constraint with proper NULL handling
ALTER TABLE vehicles
  ADD CONSTRAINT vehicles_assigned_to_fkey 
  FOREIGN KEY (assigned_to) 
  REFERENCES users(id) 
  ON DELETE SET NULL;
