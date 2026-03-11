const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function verify() {
  console.log('\n📊 Checking Milk Tests Linking Status...\n');

  try {
    // Check if columns exist
    const { data: compTests, error: e1 } = await supabase
      .from('milk_composition_tests')
      .select('id, milk_weight_id, paemimo_data')
      .limit(1);

    if (e1 && e1.message.includes('milk_weight_id')) {
      console.log('❌ Migration NOT applied yet');
      console.log('\nTo apply the migration:');
      console.log('1. Open: https://supabase.com/dashboard/project/olxnahsxvyiadknybagt/sql/new');
      console.log('2. Copy and paste from: supabase/migrations/20260116000000_link_milk_weights_to_tests.sql');
      console.log('3. Click RUN\n');
      return;
    }

    console.log('✅ Migration columns exist!\n');

    // Count linked composition tests
    const { count: compLinked } = await supabase
      .from('milk_composition_tests')
      .select('*', { count: 'exact', head: true })
      .not('milk_weight_id', 'is', null);

    const { count: compTotal } = await supabase
      .from('milk_composition_tests')
      .select('*', { count: 'exact', head: true });

    console.log(`📈 Composition Tests:`);
    console.log(`   Total: ${compTotal}`);
    console.log(`   Linked: ${compLinked}`);
    console.log(`   Success Rate: ${compTotal > 0 ? ((compLinked / compTotal) * 100).toFixed(1) : 0}%\n`);

    // Count linked quality tests
    const { count: qualLinked } = await supabase
      .from('milk_quality_tests')
      .select('*', { count: 'exact', head: true })
      .not('milk_weight_id', 'is', null);

    const { count: qualTotal } = await supabase
      .from('milk_quality_tests')
      .select('*', { count: 'exact', head: true });

    console.log(`📈 Quality Tests:`);
    console.log(`   Total: ${qualTotal}`);
    console.log(`   Linked: ${qualLinked}`);
    console.log(`   Success Rate: ${qualTotal > 0 ? ((qualLinked / qualTotal) * 100).toFixed(1) : 0}%\n`);

    // Check combined view
    const { data: combined, error: viewErr } = await supabase
      .from('milk_data_combined')
      .select('date, session_type, milk_weight_kg, fat_percentage, protein_percentage')
      .not('composition_test_id', 'is', null)
      .limit(5);

    if (viewErr) {
      console.log(`⚠️  View not accessible: ${viewErr.message}\n`);
    } else {
      console.log('✅ Combined view working!');
      console.log(`   Found ${combined?.length || 0} sample records with test data\n`);

      if (combined && combined.length > 0) {
        console.log('Sample combined data:');
        console.table(combined.slice(0, 3));
      }
    }

    // Show some linkage examples
    const { data: examples } = await supabase
      .from('milk_composition_tests')
      .select(`
        paemimo_data,
        riebalu_kiekis,
        baltymu_kiekis,
        milk_weight_id,
        milk_producers!inner(label)
      `)
      .not('milk_weight_id', 'is', null)
      .limit(3);

    if (examples && examples.length > 0) {
      console.log('\n✅ Example Linked Records:');
      examples.forEach(ex => {
        console.log(`   ${ex.paemimo_data} (${ex.milk_producers.label}): Fat ${ex.riebalu_kiekis}%, Protein ${ex.baltymu_kiekis}% - Linked to weight ID: ${ex.milk_weight_id.substring(0, 8)}...`);
      });
    }

    console.log('\n🎉 Verification complete!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

verify();
