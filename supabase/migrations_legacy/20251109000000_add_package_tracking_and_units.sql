/*
  # Enhanced Stock Reception and Package Tracking System

  1. Schema Changes
    - Add package_size and package_count columns to batches table
    - These fields track individual package dimensions and quantity
    - received_qty remains as the calculated total (package_size * package_count)

  2. New Unit Types
    - Add 'bolus' and 'syringe' to the unit types
    - Extends existing units: ml, l, g, kg, pcs, tablet

  3. New Product Category
    - Add 'vakcina' (vaccine) as a new product category
    - Complements existing 'prevention' category for vaccination management

  4. Automatic Calculation
    - When package_size and package_count are provided, received_qty is automatically calculated
    - Maintains backward compatibility with direct received_qty input

  5. Important Notes
    - Package size represents a single unit (e.g., 1 bottle = 10ml)
    - Package count is how many of those units were received
    - Total received_qty = package_size * package_count
    - Registration codes remain only in products table, not in reception process
*/

-- Add package tracking columns to batches table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'batches' AND column_name = 'package_size'
  ) THEN
    ALTER TABLE batches ADD COLUMN package_size numeric(10,2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'batches' AND column_name = 'package_count'
  ) THEN
    ALTER TABLE batches ADD COLUMN package_count numeric(10,2);
  END IF;
END $$;

-- Create or replace the function to automatically calculate received_qty
CREATE OR REPLACE FUNCTION calculate_received_qty()
RETURNS TRIGGER AS $$
BEGIN
  -- If both package_size and package_count are provided, calculate received_qty
  IF NEW.package_size IS NOT NULL AND NEW.package_count IS NOT NULL THEN
    NEW.received_qty := NEW.package_size * NEW.package_count;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if it exists and create it
DROP TRIGGER IF EXISTS trigger_calculate_received_qty ON batches;
CREATE TRIGGER trigger_calculate_received_qty
  BEFORE INSERT OR UPDATE ON batches
  FOR EACH ROW
  EXECUTE FUNCTION calculate_received_qty();

-- Add comment to explain the package tracking system
COMMENT ON COLUMN batches.package_size IS 'Size of a single package unit (e.g., 1 bottle = 10ml, 1 box = 100 tablets)';
COMMENT ON COLUMN batches.package_count IS 'Number of packages received (e.g., 6 bottles, 3 boxes)';
COMMENT ON COLUMN batches.received_qty IS 'Total quantity calculated as package_size * package_count, or manually entered';

-- Note: Unit types and product categories are typically handled at the application level
-- in TypeScript enums and form validations. The database uses text/varchar columns
-- which already support the new values: 'bolus', 'syringe', 'vakcina'

-- Add index for better query performance on package fields
CREATE INDEX IF NOT EXISTS idx_batches_package_size ON batches(package_size);
CREATE INDEX IF NOT EXISTS idx_batches_package_count ON batches(package_count);
