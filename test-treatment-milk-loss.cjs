// Rename this file to .cjs or run as: node test-treatment-milk-loss.cjs
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function testTreatmentMilkLossSystem() {
  console.log('Testing Treatment Milk Loss Tracking System...\n');
  console.log('='.repeat(60));

  try {
    // Test 1: Check if functions exist
    console.log('\n1️⃣  Testing Database Functions...');
    console.log('-'.repeat(60));

    const { data: testAnimal, error: e1 } = await supabase
      .from('animals')
      .select('id, tag_no')
      .limit(1);

    if (testAnimal && testAnimal.length > 0) {
      const { data: avgMilk, error: avgError } = await supabase.rpc(
        'get_animal_avg_milk_at_date',
        {
          p_animal_id: testAnimal[0].id,
          p_date: new Date().toISOString().split('T')[0]
        }
      );

      if (avgError) {
        console.log('   ❌ get_animal_avg_milk_at_date error:', avgError.message);
      } else {
        console.log(`   ✅ get_animal_avg_milk_at_date works!`);
        console.log(`      Animal: ${testAnimal[0].tag_no}`);
        console.log(`      Avg milk: ${avgMilk} kg/day`);
      }
    }

    // Test 2: Check view exists and has data
    console.log('\n2️⃣  Testing Treatment Milk Loss View...');
    console.log('-'.repeat(60));

    const { data: viewData, error: e2 } = await supabase
      .from('treatment_milk_loss_summary')
      .select('*')
      .limit(10);

    if (e2) {
      console.log('   ❌ Error:', e2.message);
      console.log('   ⚠️  Make sure to apply the migration first!');
      console.log('   Run: node apply-treatment-milk-loss.js');
    } else {
      console.log(`   ✅ View works! Found ${viewData?.length || 0} treatments with milk loss`);

      if (viewData && viewData.length > 0) {
        const totalLoss = viewData.reduce((sum, t) => sum + parseFloat(t.total_value_lost_eur || 0), 0);
        const totalMilk = viewData.reduce((sum, t) => sum + parseFloat(t.total_milk_lost_kg || 0), 0);
        const totalDays = viewData.reduce((sum, t) => sum + parseInt(t.total_loss_days || 0), 0);

        console.log('\n   📊 Summary Statistics:');
        console.log(`      Total treatments: ${viewData.length}`);
        console.log(`      Total days lost: ${totalDays}`);
        console.log(`      Total milk lost: ${totalMilk.toFixed(2)} kg`);
        console.log(`      Total value lost: €${totalLoss.toFixed(2)}`);
        console.log(`      Avg loss/treatment: €${(totalLoss / viewData.length).toFixed(2)}`);
      }
    }

    // Test 3: Show sample treatment details
    console.log('\n3️⃣  Sample Treatment Details...');
    console.log('-'.repeat(60));

    const { data: sampleTreatments, error: e3 } = await supabase
      .from('treatment_milk_loss_summary')
      .select('*')
      .order('total_value_lost_eur', { ascending: false })
      .limit(3);

    if (!e3 && sampleTreatments && sampleTreatments.length > 0) {
      sampleTreatments.forEach((t, idx) => {
        console.log(`\n   Treatment ${idx + 1}:`);
        console.log(`      Animal: ${t.animal_tag}`);
        console.log(`      Date: ${t.treatment_date}`);
        console.log(`      Diagnosis: ${t.clinical_diagnosis || 'N/A'}`);
        console.log(`      Veterinarian: ${t.vet_name || 'N/A'}`);
        console.log(`      Withdrawal period: ${t.treatment_date} → ${t.withdrawal_until_milk}`);
        console.log(`      Days: ${t.withdrawal_days} + ${t.safety_days} safety = ${t.total_loss_days} total`);
        console.log(`      Avg milk: ${t.avg_daily_milk_kg} kg/day`);
        console.log(`      Total lost: ${t.total_milk_lost_kg} kg`);
        console.log(`      Price: €${t.milk_price_eur_per_kg}/kg`);
        console.log(`      💰 VALUE LOST: €${t.total_value_lost_eur}`);

        if (t.medications_used && t.medications_used.length > 0) {
          console.log(`      Medications:`);
          t.medications_used.forEach(med => {
            console.log(`         - ${med.product_name} (${med.qty} ${med.unit})`);
            console.log(`           Withdrawal: ${med.withdrawal_milk_days}d milk, ${med.withdrawal_meat_days}d meat`);
          });
        }
      });
    }

    // Test 4: Check system settings
    console.log('\n4️⃣  Checking Milk Price Configuration...');
    console.log('-'.repeat(60));

    const { data: settings, error: e4 } = await supabase
      .from('system_settings')
      .select('*')
      .eq('setting_key', 'milk_price_per_liter');

    if (e4) {
      console.log('   ❌ Error:', e4.message);
    } else if (settings && settings.length > 0) {
      console.log(`   ✅ Milk price: €${settings[0].setting_value}/kg`);
      console.log(`   📝 To update: Update in system_settings table`);
    }

    // Test 5: Animals with most milk loss
    console.log('\n5️⃣  Top 5 Animals by Milk Loss...');
    console.log('-'.repeat(60));

    const { data: allTreatments, error: e5 } = await supabase
      .from('treatment_milk_loss_summary')
      .select('animal_id, animal_tag, total_value_lost_eur, total_milk_lost_kg, total_loss_days');

    if (!e5 && allTreatments && allTreatments.length > 0) {
      // Aggregate by animal
      const animalMap = new Map();
      allTreatments.forEach(t => {
        if (!animalMap.has(t.animal_id)) {
          animalMap.set(t.animal_id, {
            tag: t.animal_tag,
            treatments: 0,
            totalValue: 0,
            totalMilk: 0,
            totalDays: 0
          });
        }
        const animal = animalMap.get(t.animal_id);
        animal.treatments += 1;
        animal.totalValue += parseFloat(t.total_value_lost_eur || 0);
        animal.totalMilk += parseFloat(t.total_milk_lost_kg || 0);
        animal.totalDays += parseInt(t.total_loss_days || 0);
      });

      // Convert to array and sort
      const topAnimals = Array.from(animalMap.values())
        .sort((a, b) => b.totalValue - a.totalValue)
        .slice(0, 5);

      topAnimals.forEach((animal, idx) => {
        console.log(`\n   ${idx + 1}. ${animal.tag}`);
        console.log(`      Treatments: ${animal.treatments}`);
        console.log(`      Days: ${animal.totalDays}`);
        console.log(`      Milk lost: ${animal.totalMilk.toFixed(2)} kg`);
        console.log(`      💰 VALUE: €${animal.totalValue.toFixed(2)}`);
      });
    }

    // Test 6: Recent treatments
    console.log('\n6️⃣  Recent Treatments (Last 30 Days)...');
    console.log('-'.repeat(60));

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: recentTreatments, error: e6 } = await supabase
      .from('treatment_milk_loss_summary')
      .select('*')
      .gte('treatment_date', thirtyDaysAgo.toISOString().split('T')[0])
      .order('treatment_date', { ascending: false });

    if (!e6 && recentTreatments) {
      console.log(`   ✅ Found ${recentTreatments.length} recent treatments`);

      if (recentTreatments.length > 0) {
        const recentTotal = recentTreatments.reduce((sum, t) => sum + parseFloat(t.total_value_lost_eur || 0), 0);
        console.log(`   💰 Total loss (last 30 days): €${recentTotal.toFixed(2)}`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ All tests completed!');
    console.log('\n📌 Next Steps:');
    console.log('   1. Open the app and go to: Gydymų Savikainos → Karencija');
    console.log('   2. Or expand any animal and click "Pieno Nuostoliai" button');
    console.log('   3. Review milk losses and make data-driven decisions!');
    console.log('='.repeat(60) + '\n');

  } catch (err) {
    console.error('\n❌ Error during testing:', err.message);
    console.log('\n⚠️  Make sure to apply the migration first!');
    console.log('Run: node apply-treatment-milk-loss.js\n');
  }
}

testTreatmentMilkLossSystem();
