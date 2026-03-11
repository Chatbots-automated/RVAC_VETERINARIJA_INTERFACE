const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function applyMigration() {
  // Parse the database URL
  const dbUrl = process.env.VITE_SUPABASE_DB_URL;

  if (!dbUrl) {
    console.error('❌ VITE_SUPABASE_DB_URL not found in .env');
    console.log('\nPlease apply migration manually:');
    console.log('1. Go to Supabase SQL Editor');
    console.log('2. Run: supabase/migrations/20260116000000_link_milk_weights_to_tests.sql\n');
    return;
  }

  const client = new Client({
    connectionString: dbUrl,
  });

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected!\n');

    console.log('📂 Reading migration file...');
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, 'supabase/migrations/20260116000000_link_milk_weights_to_tests.sql'),
      'utf8'
    );
    console.log('✅ Migration file loaded\n');

    console.log('🚀 Executing migration...\n');
    const result = await client.query(migrationSQL);
    console.log('✅ Migration applied successfully!\n');

    // Get the linking results from the notices
    console.log('📊 Checking results...\n');

    // Query to see how many were linked
    const compResult = await client.query(`
      SELECT COUNT(*) as linked_count
      FROM milk_composition_tests
      WHERE milk_weight_id IS NOT NULL
    `);

    const qualResult = await client.query(`
      SELECT COUNT(*) as linked_count
      FROM milk_quality_tests
      WHERE milk_weight_id IS NOT NULL
    `);

    console.log(`✅ Composition tests linked: ${compResult.rows[0].linked_count}`);
    console.log(`✅ Quality tests linked: ${qualResult.rows[0].linked_count}`);

    // Test the view
    const viewTest = await client.query(`
      SELECT COUNT(*) as total FROM milk_data_combined
    `);
    console.log(`✅ Combined view has ${viewTest.rows[0].total} records\n`);

    // Show sample combined data
    const sample = await client.query(`
      SELECT
        date,
        session_type,
        milk_weight_kg,
        fat_percentage,
        protein_percentage,
        somatic_cell_count,
        total_bacteria_count
      FROM milk_data_combined
      WHERE composition_test_id IS NOT NULL OR quality_test_id IS NOT NULL
      LIMIT 3
    `);

    if (sample.rows.length > 0) {
      console.log('📋 Sample combined data:');
      console.table(sample.rows);
    }

    console.log('\n🎉 Migration completed successfully!');

  } catch (error) {
    console.error('\n❌ Error applying migration:', error.message);
    console.log('\nPlease apply migration manually:');
    console.log('1. Open Supabase SQL Editor: https://supabase.com/dashboard/project/olxnahsxvyiadknybagt/sql/new');
    console.log('2. Copy and paste the contents of:');
    console.log('   supabase/migrations/20260116000000_link_milk_weights_to_tests.sql');
    console.log('3. Click RUN\n');
  } finally {
    await client.end();
  }
}

applyMigration();
