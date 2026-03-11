const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

const sql = `
-- Fix the linking function to handle multiple weight events per date/session
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
  UPDATE milk_composition_tests
  SET milk_weight_id = subq.weight_id
  FROM (
    SELECT DISTINCT ON (mct.id)
      mct.id as test_id,
      mw.id as weight_id
    FROM milk_composition_tests mct
    INNER JOIN milk_producers mp ON mp.id = mct.producer_id
    INNER JOIN milk_weights mw ON mw.date = mct.paemimo_data AND mw.session_type = mp.label
    WHERE mct.milk_weight_id IS NULL
      AND mct.paemimo_data <= CURRENT_DATE
    ORDER BY mct.id, mw.weight DESC
  ) subq
  WHERE milk_composition_tests.id = subq.test_id;

  GET DIAGNOSTICS v_composition_count = ROW_COUNT;

  UPDATE milk_quality_tests
  SET milk_weight_id = subq.weight_id
  FROM (
    SELECT DISTINCT ON (mqt.id)
      mqt.id as test_id,
      mw.id as weight_id
    FROM milk_quality_tests mqt
    INNER JOIN milk_producers mp ON mp.id = mqt.producer_id
    INNER JOIN milk_weights mw ON mw.date = mqt.paemimo_data AND mw.session_type = mp.label
    WHERE mqt.milk_weight_id IS NULL
      AND mqt.paemimo_data <= CURRENT_DATE
    ORDER BY mqt.id, mw.weight DESC
  ) subq
  WHERE milk_quality_tests.id = subq.test_id;

  GET DIAGNOSTICS v_quality_count = ROW_COUNT;

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

CREATE OR REPLACE FUNCTION auto_link_milk_test_to_weight()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_weight_id uuid;
  v_producer_label text;
BEGIN
  IF NEW.milk_weight_id IS NULL AND NEW.paemimo_data <= CURRENT_DATE THEN
    SELECT label INTO v_producer_label
    FROM milk_producers
    WHERE id = NEW.producer_id;

    SELECT id INTO v_weight_id
    FROM milk_weights
    WHERE date = NEW.paemimo_data
      AND session_type = v_producer_label
    ORDER BY weight DESC
    LIMIT 1;

    IF v_weight_id IS NOT NULL THEN
      NEW.milk_weight_id := v_weight_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
`;

(async () => {
  console.log('Applying function fixes...');
  
  const { data, error } = await supabase.rpc('execute_sql', { 
    query: sql 
  });
  
  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }
  
  console.log('Functions updated!');
  
  console.log('\nNow running link function...');
  const { data: linkResult, error: linkError } = await supabase
    .rpc('link_past_milk_tests_to_weights');
    
  if (linkError) {
    console.error('Link error:', linkError);
    process.exit(1);
  }
  
  console.log('Link result:', linkResult);
})();
