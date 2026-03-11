const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function applyMigration() {
  console.log('🔗 Linking Milk Tests to Milk Weights Migration');
  console.log('================================================\n');

  try {
    console.log('📖 Reading migration file...');
    const sql = fs.readFileSync('./link-milk-tests-to-weights-migration.sql', 'utf8');
    console.log('✅ Migration file loaded\n');

    console.log('⚠️  This migration requires direct database access.');
    console.log('Please apply it using one of these methods:\n');
    console.log('1. 📊 Supabase Dashboard SQL Editor:');
    console.log('   - Visit: https://supabase.com/dashboard/project/olxnahsxvyiadknybagt/sql/new');
    console.log('   - Copy contents from: link-milk-tests-to-weights-migration.sql');
    console.log('   - Click "Run"\n');
    console.log('2. 🔧 Supabase CLI:');
    console.log('   - Install: npm install -g supabase');
    console.log('   - Link: supabase link --project-ref olxnahsxvyiadknybagt');
    console.log('   - Apply: supabase db push\n');

    console.log('After applying the migration, run this script again to see the results.\n');

    // Try to check if the migration was already applied
    console.log('🔍 Checking if migration was already applied...\n');

    const { data: compositionCols, error: compError } = await supabase
      .from('milk_composition_tests')
      .select('milk_weight_id')
      .limit(1);

    if (!compError && compositionCols !== null) {
      console.log('✅ Migration appears to be applied! Checking results...\n');

      // Query the stats
      const { data: compositionTests } = await supabase
        .from('milk_composition_tests')
        .select('milk_weight_id');

      const { data: qualityTests } = await supabase
        .from('milk_quality_tests')
        .select('milk_weight_id');

      const { data: weights } = await supabase
        .from('milk_weights')
        .select('id, date');

      const compositionLinked = compositionTests?.filter(t => t.milk_weight_id !== null).length || 0;
      const qualityLinked = qualityTests?.filter(t => t.milk_weight_id !== null).length || 0;
      const compositionTotal = compositionTests?.length || 0;
      const qualityTotal = qualityTests?.length || 0;
      const totalWeights = weights?.length || 0;
      const uniqueDates = new Set(weights?.map(w => w.date)).size || 0;

      console.log('📈 Results:');
      console.log('───────────────────────────────────────────────────');
      console.log(`Composition Tests: ${compositionLinked} / ${compositionTotal} linked (${compositionTotal > 0 ? ((compositionLinked / compositionTotal) * 100).toFixed(1) : 0}%)`);
      console.log(`Quality Tests:     ${qualityLinked} / ${qualityTotal} linked (${qualityTotal > 0 ? ((qualityLinked / qualityTotal) * 100).toFixed(1) : 0}%)`);
      console.log(`Total Linked:      ${compositionLinked + qualityLinked} test records`);
      console.log(`Milk Weight Records: ${totalWeights} records across ${uniqueDates} unique dates`);
      console.log('───────────────────────────────────────────────────\n');

      // Show some sample linked data
      console.log('📋 Sample linked records from view:\n');

      const { data: samples, error: viewError } = await supabase
        .from('milk_data_combined')
        .select('*')
        .order('date', { ascending: false })
        .limit(5);

      if (!viewError && samples && samples.length > 0) {
        console.log('Date       | Session  | Weight | Has Comp | Has Qual | Fat%  | Protein%');
        console.log('-----------|----------|--------|----------|----------|-------|----------');
        samples.forEach(row => {
          console.log(
            `${row.date} | ` +
            `${(row.session_type || '').padEnd(8)} | ` +
            `${(row.milk_weight_kg || 0).toString().padEnd(6)} | ` +
            `${(row.composition_test_id ? '✓' : '✗').padEnd(8)} | ` +
            `${(row.quality_test_id ? '✓' : '✗').padEnd(8)} | ` +
            `${(row.fat_percentage || '-').toString().padEnd(5)} | ` +
            `${(row.protein_percentage || '-')}`
          );
        });

        console.log('\n✨ Migration is working correctly!');
        console.log('💡 Future test records will be automatically linked to milk weights.');
      } else if (viewError) {
        console.log('⚠️  View not found. Please apply the migration first.');
      } else {
        console.log('No records found in the combined view.');
      }

    } else {
      console.log('⏳ Migration not yet applied. Please follow the instructions above.\n');
    }

  } catch (err) {
    console.error('\n❌ Error:', err.message);
  }
}

applyMigration();
