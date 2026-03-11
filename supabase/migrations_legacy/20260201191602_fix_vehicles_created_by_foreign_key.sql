/*
  # Fix Vehicles created_by Foreign Key Constraint

  ## Changes
  
  1. Drop the existing foreign key that points to auth.users
  2. Create a new foreign key that points to the public.users table
  3. Allow NULL values for created_by field
  
  This fixes the error: "insert or update on table vehicles violates foreign key constraint vehicles_created_by_fkey"
*/

-- Drop existing constraint
ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_created_by_fkey;

-- Add new constraint pointing to public.users table with NULL handling
ALTER TABLE vehicles
  ADD CONSTRAINT vehicles_created_by_fkey 
  FOREIGN KEY (created_by) 
  REFERENCES users(id) 
  ON DELETE SET NULL;
