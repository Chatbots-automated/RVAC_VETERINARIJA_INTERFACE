/*
  # Fix RLS Policies for Milk Test Tables

  1. Changes
    - Add RLS policies for milk_producers table
    - Add RLS policies for milk_composition_tests table
    - Add RLS policies for milk_quality_tests table
    - These tables contain herd-level data (not individual animal data)

  2. Security
    - Enable RLS on all tables
    - Allow authenticated users to read all data
    - Allow authenticated users to insert/update data
*/

-- milk_producers policies
DROP POLICY IF EXISTS "Users can view milk producers" ON milk_producers;
DROP POLICY IF EXISTS "Users can insert milk producers" ON milk_producers;
DROP POLICY IF EXISTS "Users can update milk producers" ON milk_producers;

CREATE POLICY "Users can view milk producers"
  ON milk_producers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert milk producers"
  ON milk_producers FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update milk producers"
  ON milk_producers FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- milk_composition_tests policies
DROP POLICY IF EXISTS "Users can view composition tests" ON milk_composition_tests;
DROP POLICY IF EXISTS "Users can insert composition tests" ON milk_composition_tests;
DROP POLICY IF EXISTS "Users can update composition tests" ON milk_composition_tests;

CREATE POLICY "Users can view composition tests"
  ON milk_composition_tests FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert composition tests"
  ON milk_composition_tests FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update composition tests"
  ON milk_composition_tests FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- milk_quality_tests policies
DROP POLICY IF EXISTS "Users can view quality tests" ON milk_quality_tests;
DROP POLICY IF EXISTS "Users can insert quality tests" ON milk_quality_tests;
DROP POLICY IF EXISTS "Users can update quality tests" ON milk_quality_tests;

CREATE POLICY "Users can view quality tests"
  ON milk_quality_tests FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert quality tests"
  ON milk_quality_tests FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update quality tests"
  ON milk_quality_tests FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
