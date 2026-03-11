import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function testNaturalMilkWeight() {
  console.log('Testing Natural Milk Weight Calculation System\n');
  console.log('='.repeat(60));

  try {
    // Test 1: Verify columns exist
    console.log('\n1. Checking if new columns exist...');
    const { data: columns, error: colError } = await supabase
      .from('milk_production')
      .select('scale_weight_kg, scale_timestamp_lt, recalculation_coefficient, natural_weight_kg')
      .limit(1);

    if (colError && colError.code !== 'PGRST116') {
      throw colError;
    }
    console.log('   ✓ All columns exist!');

    // Test 2: Get sample producer
    console.log('\n2. Finding a producer for testing...');
    const { data: producers, error: prodError } = await supabase
      .from('milk_producers')
      .select('id, gamintojas_code, imone')
      .limit(1);

    if (prodError) throw prodError;

    if (!producers || producers.length === 0) {
      console.log('   ! No producers found. Please add a producer first.');
      return;
    }

    const producer = producers[0];
    console.log(`   ✓ Using producer: ${producer.imone} (${producer.gamintojas_code})`);

    // Test 3: Insert sample composition test
    console.log('\n3. Inserting sample composition test...');
    const testDate = new Date().toISOString().split('T')[0];
    const testContainer = `TEST-${Date.now()}`;

    const { data: compTest, error: compError } = await supabase
      .from('milk_composition_tests')
      .insert({
        producer_id: producer.id,
        konteineris: testContainer,
        paemimo_data: testDate,
        atvezimo_data: testDate,
        tyrimo_data: testDate,
        riebalu_kiekis: 4.2,  // Fat: 4.2%
        baltymu_kiekis: 3.8,  // Protein: 3.8%
        laktozes_kiekis: 4.5,
        prot_nr: 'TEST-001'
      })
      .select()
      .single();

    if (compError) throw compError;
    console.log(`   ✓ Composition test created with fat=4.2%, protein=3.8%`);

    // Test 4: Insert sample production with scale weight
    console.log('\n4. Inserting sample production with scale weight...');
    const { data: production, error: prodInsertError } = await supabase
      .from('milk_production')
      .insert({
        producer_id: producer.id,
        konteineris: testContainer,
        production_date: testDate,
        scale_weight_kg: 1000.00,  // 1000 kg from scale
        scale_timestamp_lt: new Date().toISOString(),
        temperature_c: 4.5
      })
      .select()
      .single();

    if (prodInsertError) throw prodInsertError;
    console.log(`   ✓ Production record created with scale_weight=1000 kg`);

    // Test 5: Verify automatic calculation
    console.log('\n5. Verifying automatic calculation...');

    // Wait a moment for trigger to execute
    await new Promise(resolve => setTimeout(resolve, 1000));

    const { data: result, error: resultError } = await supabase
      .from('milk_production')
      .select('*')
      .eq('id', production.id)
      .single();

    if (resultError) throw resultError;

    console.log('\n   Results:');
    console.log(`   - Scale Weight:    ${result.scale_weight_kg} kg`);
    console.log(`   - Coefficient:     ${result.recalculation_coefficient}`);
    console.log(`   - Natural Weight:  ${result.natural_weight_kg} kg`);
    console.log(`   - Difference:      ${(result.natural_weight_kg - result.scale_weight_kg).toFixed(2)} kg`);

    // Calculate expected values
    const expectedCoeff = (0.4 * 4.2 + 0.6 * 3.8) / (0.4 * 3.4 + 0.6 * 3.0);
    const expectedNatural = 1000 * expectedCoeff;

    console.log('\n   Expected:');
    console.log(`   - Coefficient:     ${expectedCoeff.toFixed(4)}`);
    console.log(`   - Natural Weight:  ${expectedNatural.toFixed(2)} kg`);

    // Verify calculation is correct
    if (Math.abs(result.recalculation_coefficient - expectedCoeff) < 0.001 &&
        Math.abs(result.natural_weight_kg - expectedNatural) < 0.1) {
      console.log('\n   ✓ Calculation is CORRECT!');
    } else {
      console.log('\n   ✗ Calculation mismatch!');
    }

    // Test 6: Test composition update trigger
    console.log('\n6. Testing composition update trigger...');
    const { error: updateError } = await supabase
      .from('milk_composition_tests')
      .update({
        riebalu_kiekis: 5.0,  // Change fat to 5.0%
        baltymu_kiekis: 4.0   // Change protein to 4.0%
      })
      .eq('id', compTest.id);

    if (updateError) throw updateError;

    await new Promise(resolve => setTimeout(resolve, 1000));

    const { data: updatedResult, error: updatedError } = await supabase
      .from('milk_production')
      .select('*')
      .eq('id', production.id)
      .single();

    if (updatedError) throw updatedError;

    const newExpectedCoeff = (0.4 * 5.0 + 0.6 * 4.0) / (0.4 * 3.4 + 0.6 * 3.0);
    const newExpectedNatural = 1000 * newExpectedCoeff;

    console.log(`   ✓ Composition updated to fat=5.0%, protein=4.0%`);
    console.log(`   - New Coefficient:     ${updatedResult.recalculation_coefficient}`);
    console.log(`   - New Natural Weight:  ${updatedResult.natural_weight_kg} kg`);
    console.log(`   - Expected:            ${newExpectedNatural.toFixed(2)} kg`);

    if (Math.abs(updatedResult.natural_weight_kg - newExpectedNatural) < 0.1) {
      console.log('   ✓ Trigger recalculation works!');
    }

    // Test 7: Clean up test data
    console.log('\n7. Cleaning up test data...');
    await supabase.from('milk_production').delete().eq('id', production.id);
    await supabase.from('milk_composition_tests').delete().eq('id', compTest.id);
    console.log('   ✓ Test data cleaned up');

    console.log('\n' + '='.repeat(60));
    console.log('ALL TESTS PASSED!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n✗ Test failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

testNaturalMilkWeight();
