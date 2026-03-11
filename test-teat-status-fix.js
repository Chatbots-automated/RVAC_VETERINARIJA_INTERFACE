import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function testTeatStatusSaving() {
  console.log('\n=== TESTING TEAT STATUS SAVING ===\n');

  // Get a test animal
  const { data: animals, error: animalsError } = await supabase
    .from('animals')
    .select('id')
    .limit(1);

  if (animalsError || !animals || animals.length === 0) {
    console.error('No animals found or error:', animalsError);
    return;
  }

  const testAnimalId = animals[0].id;
  console.log('Testing with animal ID:', testAnimalId);

  // Test 1: Insert disabled teats (lowercase)
  console.log('\n--- Test 1: Inserting disabled teats ---');
  const allTeatPositions = ['K1', 'K2', 'D1', 'D2'];
  const disabledTeats = ['K1', 'D1'];

  for (const teatPosition of allTeatPositions) {
    const isDisabled = disabledTeats.includes(teatPosition);

    const { data, error } = await supabase
      .from('teat_status')
      .upsert({
        animal_id: testAnimalId,
        teat_position: teatPosition.toLowerCase(),
        is_disabled: isDisabled,
        disabled_date: isDisabled ? '2025-12-31' : null,
        disabled_reason: isDisabled ? 'Test reason' : null,
      }, {
        onConflict: 'animal_id,teat_position'
      })
      .select();

    if (error) {
      console.error(`❌ Error saving ${teatPosition}:`, error);
    } else {
      console.log(`✅ Saved ${teatPosition} (disabled: ${isDisabled})`);
    }
  }

  // Test 2: Read back the disabled teats
  console.log('\n--- Test 2: Reading disabled teats ---');
  const { data: readData, error: readError } = await supabase
    .from('teat_status')
    .select('*')
    .eq('animal_id', testAnimalId);

  if (readError) {
    console.error('❌ Error reading:', readError);
  } else {
    console.log('All teat statuses:');
    console.table(readData);
  }

  // Test 3: Read only disabled teats
  console.log('\n--- Test 3: Reading only disabled teats ---');
  const { data: disabledData, error: disabledError } = await supabase
    .from('teat_status')
    .select('*')
    .eq('animal_id', testAnimalId)
    .eq('is_disabled', true);

  if (disabledError) {
    console.error('❌ Error reading disabled:', disabledError);
  } else {
    console.log('Disabled teats:');
    console.table(disabledData);
    console.log('\nDisabled teat positions (uppercase):', disabledData.map(t => t.teat_position.toUpperCase()));
  }

  // Test 4: Update to enable one teat
  console.log('\n--- Test 4: Enabling K1 ---');
  const { data: updateData, error: updateError } = await supabase
    .from('teat_status')
    .upsert({
      animal_id: testAnimalId,
      teat_position: 'k1',
      is_disabled: false,
      disabled_date: null,
      disabled_reason: null,
    }, {
      onConflict: 'animal_id,teat_position'
    })
    .select();

  if (updateError) {
    console.error('❌ Error updating:', updateError);
  } else {
    console.log('✅ K1 enabled');
  }

  // Test 5: Verify final state
  console.log('\n--- Test 5: Final state ---');
  const { data: finalData, error: finalError } = await supabase
    .from('teat_status')
    .select('*')
    .eq('animal_id', testAnimalId)
    .eq('is_disabled', true);

  if (finalError) {
    console.error('❌ Error reading final state:', finalError);
  } else {
    console.log('Remaining disabled teats:');
    console.table(finalData);
  }

  console.log('\n✅ All tests completed!\n');
}

testTeatStatusSaving().catch(console.error);
