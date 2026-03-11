const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  console.log('Manually linking tests to weights...\n');

  // Step 1: Get all composition tests that need linking
  const { data: compTests, error: compError } = await supabase
    .from('milk_composition_tests')
    .select('id, paemimo_data, producer_id, milk_producers(label)')
    .is('milk_weight_id', null)
    .lte('paemimo_data', new Date().toISOString().split('T')[0]);

  if (compError) {
    console.error('Error loading composition tests:', compError);
    return;
  }

  console.log(`Found ${compTests.length} composition tests to link`);

  let compLinked = 0;
  let compChecked = 0;
  for (const test of compTests) {
    compChecked++;
    const producerLabel = test.milk_producers?.label;
    if (!producerLabel) {
      console.log(`  Test ${compChecked}: No producer label`);
      continue;
    }

    // Find max weight for this date/session
    const { data: weights, error: weightError } = await supabase
      .from('milk_weights')
      .select('id, weight')
      .eq('date', test.paemimo_data)
      .eq('session_type', producerLabel)
      .order('weight', { ascending: false })
      .limit(1);

    if (weightError) {
      console.log(`  Test ${compChecked}: Error finding weights:`, weightError);
      continue;
    }

    if (!weights || weights.length === 0) {
      console.log(`  Test ${compChecked}: No weight found for ${test.paemimo_data} ${producerLabel}`);
      continue;
    }

    const { error: updateError } = await supabase
      .from('milk_composition_tests')
      .update({ milk_weight_id: weights[0].id })
      .eq('id', test.id);

    if (updateError) {
      console.log(`  Test ${compChecked}: Update error:`, updateError);
    } else {
      compLinked++;
      console.log(`  Test ${compChecked}: Linked to weight ${weights[0].id}`);
    }
  }

  console.log(`Linked ${compLinked} composition tests\n`);

  // Step 2: Get all quality tests that need linking
  const { data: qualTests, error: qualError } = await supabase
    .from('milk_quality_tests')
    .select('id, paemimo_data, producer_id, milk_producers(label)')
    .is('milk_weight_id', null)
    .lte('paemimo_data', new Date().toISOString().split('T')[0]);

  if (qualError) {
    console.error('Error loading quality tests:', qualError);
    return;
  }

  console.log(`Found ${qualTests.length} quality tests to link`);

  let qualLinked = 0;
  for (const test of qualTests) {
    const producerLabel = test.milk_producers?.label;
    if (!producerLabel) continue;

    // Find max weight for this date/session
    const { data: weights } = await supabase
      .from('milk_weights')
      .select('id, weight')
      .eq('date', test.paemimo_data)
      .eq('session_type', producerLabel)
      .order('weight', { ascending: false })
      .limit(1);

    if (weights && weights.length > 0) {
      const { error: updateError } = await supabase
        .from('milk_quality_tests')
        .update({ milk_weight_id: weights[0].id })
        .eq('id', test.id);

      if (!updateError) {
        qualLinked++;
      }
    }
  }

  console.log(`Linked ${qualLinked} quality tests\n`);
  console.log(`TOTAL LINKED: ${compLinked + qualLinked}`);
})();
