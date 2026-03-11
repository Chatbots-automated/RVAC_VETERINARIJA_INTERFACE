const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

(async () => {
  console.log('🧪 Testing Pienas View Lab Data\n');

  const dateFrom = '2026-01-13';
  const dateTo = '2026-01-14';

  // Simulate what the frontend does
  console.log('1. Loading milk weights...');
  const { data: weights } = await supabase
    .from('milk_weights')
    .select('*')
    .gte('date', dateFrom)
    .lte('date', dateTo)
    .order('date', { ascending: false });

  console.log(`   Found ${weights?.length || 0} weight records\n`);

  console.log('2. Loading test data...');
  const { data: testData } = await supabase
    .from('milk_data_combined')
    .select('date, session_type, composition_test_id, fat_percentage, protein_percentage, lactose_percentage, urea_mg_100ml, ph_level, quality_test_id, somatic_cell_count, total_bacteria_count')
    .gte('date', dateFrom)
    .lte('date', dateTo)
    .not('composition_test_id', 'is', null);

  console.log(`   Found ${testData?.length || 0} test records\n`);

  // Create test map
  const testMap = new Map();
  testData?.forEach(row => {
    const key = `${row.date}_${row.session_type}`;
    if (!testMap.has(key)) {
      testMap.set(key, {
        composition_test: row.composition_test_id ? {
          fat_percentage: row.fat_percentage,
          protein_percentage: row.protein_percentage,
          lactose_percentage: row.lactose_percentage,
          urea_mg_100ml: row.urea_mg_100ml,
          ph_level: row.ph_level,
        } : undefined,
        quality_test: row.quality_test_id ? {
          somatic_cell_count: row.somatic_cell_count,
          total_bacteria_count: row.total_bacteria_count,
        } : undefined,
      });
    }
  });

  console.log('3. Test map entries:');
  testMap.forEach((tests, key) => {
    console.log(`   ${key}:`);
    if (tests.composition_test) {
      console.log(`      Fat: ${tests.composition_test.fat_percentage?.toFixed(2)}%`);
      console.log(`      Protein: ${tests.composition_test.protein_percentage?.toFixed(2)}%`);
      console.log(`      Lactose: ${tests.composition_test.lactose_percentage?.toFixed(2)}%`);
    }
    if (tests.quality_test) {
      console.log(`      Somatic cells: ${tests.quality_test.somatic_cell_count} tūkst./ml`);
      console.log(`      Bacteria: ${tests.quality_test.total_bacteria_count} tūkst./ml`);
    }
  });

  console.log('\n4. Summary:');
  console.log(`   Dates: ${dateFrom} to ${dateTo}`);
  console.log(`   Weight records: ${weights?.length || 0}`);
  console.log(`   Sessions with lab tests: ${testMap.size}`);

  console.log('\n✅ When you refresh Pienas module, you should see:');
  console.log('   - Expand rows for 2026-01-13');
  console.log('   - Lab test section should appear with composition and quality data');
  console.log('   - Look for "Laboratorijos tyrimai" heading in the expanded row');
})();
