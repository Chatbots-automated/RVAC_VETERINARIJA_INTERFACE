/*
  # Link Milk Tests to Milk Weights

  This migration creates the relationship between milk laboratory test results
  (dieniniai pieno svoriai) and milk weights (pieno laboratorijos tyrimai).

  1. Schema Changes
    - Add `milk_weight_id` to `milk_composition_tests`
    - Add `milk_weight_id` to `milk_quality_tests`
    - Create indexes on foreign key columns

  2. Data Migration Function
    - `link_past_milk_tests_to_weights()` - Links existing test records to weights
    - Matches on: test.paemimo_data = weight.date AND producer.label = weight.session_type
    - Only links past dates (paemimo_data <= CURRENT_DATE)
    - Returns counts of linked records

  3. Automated Linking
    - Trigger function `auto_link_milk_test_to_weight()` for automatic linking
    - Triggers on both test tables for INSERT/UPDATE operations

  4. Combined View
    - `milk_data_combined` view - Shows milk weights with linked test data
*/

-- =====================================================
-- 1. Add milk_weight_id columns to test tables
-- =====================================================

-- Add column to milk_composition_tests
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'milk_composition_tests'
    AND column_name = 'milk_weight_id'
  ) THEN
    ALTER TABLE milk_composition_tests
    ADD COLUMN milk_weight_id uuid REFERENCES milk_weights(id) ON DELETE SET NULL;

    COMMENT ON COLUMN milk_composition_tests.milk_weight_id IS
      'Links composition test to milk weight record. Matched by date and session_type.';
  END IF;
END $$;

-- Add column to milk_quality_tests
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'milk_quality_tests'
    AND column_name = 'milk_weight_id'
  ) THEN
    ALTER TABLE milk_quality_tests
    ADD COLUMN milk_weight_id uuid REFERENCES milk_weights(id) ON DELETE SET NULL;

    COMMENT ON COLUMN milk_quality_tests.milk_weight_id IS
      'Links quality test to milk weight record. Matched by date and session_type.';
  END IF;
END $$;

-- =====================================================
-- 2. Create indexes on new foreign key columns
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_milk_composition_tests_milk_weight_id
  ON milk_composition_tests(milk_weight_id);

CREATE INDEX IF NOT EXISTS idx_milk_quality_tests_milk_weight_id
  ON milk_quality_tests(milk_weight_id);

-- =====================================================
-- 3. Function to link past milk tests to weights
-- =====================================================

CREATE OR REPLACE FUNCTION link_past_milk_tests_to_weights()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_composition_count integer := 0;
  v_quality_count integer := 0;
  v_result json;
BEGIN
  -- Link composition tests to milk weights
  -- Match criteria: test.paemimo_data = weight.date
  --                 AND producer.label = weight.session_type
  --                 AND paemimo_data <= CURRENT_DATE
  UPDATE milk_composition_tests
  SET milk_weight_id = subq.weight_id
  FROM (
    SELECT
      mct.id as test_id,
      mw.id as weight_id
    FROM milk_composition_tests mct
    INNER JOIN milk_producers mp ON mp.id = mct.producer_id
    INNER JOIN milk_weights mw ON mw.date = mct.paemimo_data AND mw.session_type = mp.label
    WHERE mct.milk_weight_id IS NULL
      AND mct.paemimo_data <= CURRENT_DATE
  ) subq
  WHERE milk_composition_tests.id = subq.test_id;

  GET DIAGNOSTICS v_composition_count = ROW_COUNT;

  -- Link quality tests to milk weights
  -- Same matching criteria as composition tests
  UPDATE milk_quality_tests
  SET milk_weight_id = subq.weight_id
  FROM (
    SELECT
      mqt.id as test_id,
      mw.id as weight_id
    FROM milk_quality_tests mqt
    INNER JOIN milk_producers mp ON mp.id = mqt.producer_id
    INNER JOIN milk_weights mw ON mw.date = mqt.paemimo_data AND mw.session_type = mp.label
    WHERE mqt.milk_weight_id IS NULL
      AND mqt.paemimo_data <= CURRENT_DATE
  ) subq
  WHERE milk_quality_tests.id = subq.test_id;

  GET DIAGNOSTICS v_quality_count = ROW_COUNT;

  -- Return results
  v_result := json_build_object(
    'success', true,
    'composition_tests_linked', v_composition_count,
    'quality_tests_linked', v_quality_count,
    'total_linked', v_composition_count + v_quality_count
  );

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM,
      'error_detail', SQLSTATE
    );
END;
$$;

COMMENT ON FUNCTION link_past_milk_tests_to_weights() IS
  'Links past milk test records to milk weights by matching date and session type. Only processes past dates.';

-- =====================================================
-- 4. Execute the function to link existing data
-- =====================================================

DO $$
DECLARE
  v_result json;
BEGIN
  RAISE NOTICE 'Linking existing milk test data to weights...';

  SELECT link_past_milk_tests_to_weights() INTO v_result;

  RAISE NOTICE 'Result: %', v_result;
END $$;

-- =====================================================
-- 5. Trigger function for automatic linking
-- =====================================================

CREATE OR REPLACE FUNCTION auto_link_milk_test_to_weight()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_weight_id uuid;
  v_producer_label text;
BEGIN
  -- Only process if milk_weight_id is not already set
  -- and the test date is in the past
  IF NEW.milk_weight_id IS NULL AND NEW.paemimo_data <= CURRENT_DATE THEN

    -- Get the producer label
    SELECT label INTO v_producer_label
    FROM milk_producers
    WHERE id = NEW.producer_id;

    -- Find matching milk weight record
    -- Match on: date = paemimo_data AND session_type = producer.label
    SELECT id INTO v_weight_id
    FROM milk_weights
    WHERE date = NEW.paemimo_data
      AND session_type = v_producer_label
    LIMIT 1;

    -- If found, link it
    IF v_weight_id IS NOT NULL THEN
      NEW.milk_weight_id := v_weight_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION auto_link_milk_test_to_weight() IS
  'Automatically links new or updated milk test records to corresponding milk weights.';

-- =====================================================
-- 6. Create triggers on both test tables
-- =====================================================

-- Drop triggers if they exist
DROP TRIGGER IF EXISTS trigger_auto_link_composition_test ON milk_composition_tests;
DROP TRIGGER IF EXISTS trigger_auto_link_quality_test ON milk_quality_tests;

-- Create trigger for composition tests
CREATE TRIGGER trigger_auto_link_composition_test
  BEFORE INSERT OR UPDATE ON milk_composition_tests
  FOR EACH ROW
  EXECUTE FUNCTION auto_link_milk_test_to_weight();

-- Create trigger for quality tests
CREATE TRIGGER trigger_auto_link_quality_test
  BEFORE INSERT OR UPDATE ON milk_quality_tests
  FOR EACH ROW
  EXECUTE FUNCTION auto_link_milk_test_to_weight();

-- =====================================================
-- 7. Create combined view for milk data with tests
-- =====================================================

CREATE OR REPLACE VIEW milk_data_combined AS
SELECT
  mw.id as weight_id,
  mw.date,
  mw.session_type,
  mw.weight as milk_weight_kg,
  mw.session_id,
  mw.measurement_timestamp,
  mw.event_type,

  -- Composition test data
  mct.id as composition_test_id,
  mct.paemimo_data as composition_paemimo_data,
  mct.tyrimo_data as composition_tyrimo_data,
  mct.riebalu_kiekis as fat_percentage,
  mct.baltymu_kiekis as protein_percentage,
  mct.laktozes_kiekis as lactose_percentage,
  mct.persk_koef as conversion_coefficient,
  mct.ureja_mg_100ml as urea_mg_100ml,
  mct.ph as ph_level,
  mct.prot_nr as composition_protocol_nr,

  -- Quality test data
  mqt.id as quality_test_id,
  mqt.paemimo_data as quality_paemimo_data,
  mqt.tyrimo_data as quality_tyrimo_data,
  mqt.somatiniu_lasteliu_skaicius as somatic_cell_count,
  mqt.bendras_bakteriju_skaicius as total_bacteria_count,
  mqt.neatit_pst as non_compliance_pst,
  mqt.prot_nr as quality_protocol_nr,

  -- Producer information
  mp.id as producer_id,
  mp.gamintojas_code as producer_code,
  mp.imone as company_name,
  mp.rajonas as region,
  mp.punktas as collection_point,

  -- Metadata
  mw.created_at as weight_recorded_at,
  mct.created_at as composition_recorded_at,
  mqt.created_at as quality_recorded_at

FROM milk_weights mw

-- Left join composition tests
LEFT JOIN milk_composition_tests mct
  ON mct.milk_weight_id = mw.id

-- Left join quality tests
LEFT JOIN milk_quality_tests mqt
  ON mqt.milk_weight_id = mw.id

-- Left join producer (via composition or quality test)
LEFT JOIN milk_producers mp
  ON mp.id = COALESCE(mct.producer_id, mqt.producer_id)

-- Order by most recent first
ORDER BY mw.date DESC, mw.session_type, mw.measurement_timestamp DESC;

COMMENT ON VIEW milk_data_combined IS
  'Combines milk weights with their linked composition and quality test results. Shows all weight records with their associated laboratory test data.';

-- Grant access to the view
GRANT SELECT ON milk_data_combined TO authenticated;

-- Enable RLS on view (inherits from base tables)
ALTER VIEW milk_data_combined SET (security_invoker = true);
