/*
  # Fix Trigger Execution Order for Auto-Split

  1. Changes
    - Renames auto-split trigger to execute first (alphabetically before other triggers)
    - Ensures auto-split happens before stock validation checks

  2. Notes
    - PostgreSQL executes triggers in alphabetical order for same timing/event
    - Prefix with 'a_' to ensure it runs first
*/

-- Drop the existing trigger
DROP TRIGGER IF EXISTS trigger_auto_split_usage_items ON usage_items;

-- Recreate with a name that executes first (alphabetically)
CREATE TRIGGER a_auto_split_usage_items
  BEFORE INSERT ON usage_items
  FOR EACH ROW
  EXECUTE FUNCTION auto_split_usage_items();
