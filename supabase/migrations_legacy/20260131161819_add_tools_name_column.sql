/*
  # Add name column to tools table

  1. Changes
    - Add `name` column to tools table to allow tools to have their own names
    - This makes product_id truly optional - tools can exist independently
    - Tools can still reference products if needed, but it's not required
    
  2. Notes
    - Existing tools will have NULL names (will display product name as fallback)
    - New tools can be created with just a name, no product required
*/

-- Add name column to tools table
ALTER TABLE tools ADD COLUMN IF NOT EXISTS name text;
