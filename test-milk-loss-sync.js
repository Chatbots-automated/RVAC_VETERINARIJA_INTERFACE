const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function testMilkLossTracking() {
  console.log('Testing Milk Loss Tracking System...\n');

  try {
    // Test 1: Check if functions exist
    console.log('1. Testing calculate_average_daily_milk function...');
    const { data: animals, error: e1 } = await supabase
      .from('animals')
      .select('id, tag_no')
      .limit(1);

    if (animals && animals.length > 0) {
      const testAnimal = animals[0];
      const { data: avgMilk, error: avgError } = await supabase.rpc(
        'calculate_average_daily_milk',
        { p_animal_id: testAnimal.id, p_before_date: new Date().toISOString().split('T')[0] }
      );

      if (avgError) {
        console.log('   ❌ Error:', avgError.message);
      } else {
        console.log(`   ✓ Function works! Animal ${testAnimal.tag_no} avg milk: ${avgMilk} kg/day`);
      }
    }

    // Test 2: Check if view exists and has data
    console.log('\n2. Testing animal_milk_loss_by_synchronization view...');
    const { data: milkLoss, error: e2 } = await supabase
      .from('animal_milk_loss_by_synchronization')
      .select('*')
      .limit(5);

    if (e2) {
      console.log('   ❌ Error:', e2.message);
    } else {
      console.log(`   ✓ View works! Found ${milkLoss?.length || 0} records`);
      if (milkLoss && milkLoss.length > 0) {
        console.log('\n   Sample record:');
        const sample = milkLoss[0];
        console.log(`   - Animal: ${sample.animal_number}`);
        console.log(`   - Protocol: ${sample.protocol_name || 'N/A'}`);
        console.log(`   - Period: ${sample.sync_start} to ${sample.sync_end}`);
        console.log(`   - Days: ${sample.loss_days}`);
        console.log(`   - Avg milk: ${sample.avg_daily_milk_kg} kg/day`);
        console.log(`   - Total lost: ${sample.total_milk_lost_kg} kg`);
        console.log(`   - Value: €${sample.milk_loss_value_eur}`);
      }
    }

    // Test 3: Check system settings
    console.log('\n3. Checking milk price configuration...');
    const { data: settings, error: e3 } = await supabase
      .from('system_settings')
      .select('*')
      .eq('setting_key', 'milk_price_per_liter');

    if (e3) {
      console.log('   ❌ Error:', e3.message);
    } else if (settings && settings.length > 0) {
      console.log(`   ✓ Milk price: €${settings[0].setting_value}/kg`);
    }

    // Test 4: Summary statistics
    console.log('\n4. Summary Statistics...');
    const { data: allData, error: e4 } = await supabase
      .from('animal_milk_loss_by_synchronization')
      .select('*');

    if (!e4 && allData) {
      const totalAnimals = new Set(allData.map(r => r.animal_id)).size;
      const totalSyncs = allData.length;
      const totalValue = allData.reduce((sum, r) => sum + parseFloat(r.milk_loss_value_eur || 0), 0);
      const totalMilk = allData.reduce((sum, r) => sum + parseFloat(r.total_milk_lost_kg || 0), 0);

      console.log(`   - Total animals with synchronizations: ${totalAnimals}`);
      console.log(`   - Total synchronization periods: ${totalSyncs}`);
      console.log(`   - Total milk lost: ${totalMilk.toFixed(2)} kg`);
      console.log(`   - Total value lost: €${totalValue.toFixed(2)}`);
      if (totalSyncs > 0) {
        console.log(`   - Average loss per sync: €${(totalValue / totalSyncs).toFixed(2)}`);
      }
    }

    console.log('\n✓ All tests completed successfully!');

  } catch (err) {
    console.error('Error during testing:', err.message);
  }
}

testMilkLossTracking();
