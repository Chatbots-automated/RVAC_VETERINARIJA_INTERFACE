require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');

const connectionString = process.env.VITE_SUPABASE_DB_URL;

if (!connectionString) {
  console.error('❌ Missing VITE_SUPABASE_DB_URL environment variable');
  console.error('Please add it to your .env file');
  process.exit(1);
}

async function applyMigration() {
  const client = new Client({ connectionString });

  try {
    console.log('🔗 Linking Milk Tests to Milk Weights Migration');
    console.log('================================================\n');

    console.log('📡 Connecting to database...');
    await client.connect();
    console.log('✅ Connected\n');

    console.log('📖 Reading migration file...');
    const sql = fs.readFileSync('./link-milk-tests-to-weights-migration.sql', 'utf8');
    console.log('✅ Migration file loaded\n');

    console.log('🔧 Applying migration...');
    console.log('  - Adding milk_weight_id columns');
    console.log('  - Creating indexes');
    console.log('  - Creating linking function');
    console.log('  - Linking existing data');
    console.log('  - Creating auto-link triggers');
    console.log('  - Creating combined view\n');

    const result = await client.query(sql);

    console.log('✅ Migration applied successfully!\n');

    // Now query the linking results
    console.log('📊 Querying linking results...\n');

    const statsQuery = `
      SELECT
        (SELECT COUNT(*) FROM milk_composition_tests WHERE milk_weight_id IS NOT NULL) as composition_linked,
        (SELECT COUNT(*) FROM milk_composition_tests) as composition_total,
        (SELECT COUNT(*) FROM milk_quality_tests WHERE milk_weight_id IS NOT NULL) as quality_linked,
        (SELECT COUNT(*) FROM milk_quality_tests) as quality_total,
        (SELECT COUNT(*) FROM milk_weights) as total_weights,
        (SELECT COUNT(DISTINCT date) FROM milk_weights) as unique_dates
    `;

    const stats = await client.query(statsQuery);
    const row = stats.rows[0];

    console.log('📈 Results:');
    console.log('───────────────────────────────────────────────────');
    console.log(`Composition Tests: ${row.composition_linked} / ${row.composition_total} linked (${((row.composition_linked / row.composition_total) * 100).toFixed(1)}%)`);
    console.log(`Quality Tests:     ${row.quality_linked} / ${row.quality_total} linked (${((row.quality_linked / row.quality_total) * 100).toFixed(1)}%)`);
    console.log(`Total Linked:      ${parseInt(row.composition_linked) + parseInt(row.quality_linked)} test records`);
    console.log(`Milk Weight Records: ${row.total_weights} records across ${row.unique_dates} unique dates`);
    console.log('───────────────────────────────────────────────────\n');

    // Show some sample linked data
    console.log('📋 Sample linked records (most recent 5):\n');

    const sampleQuery = `
      SELECT
        date,
        session_type,
        milk_weight_kg,
        CASE
          WHEN composition_test_id IS NOT NULL THEN '✓'
          ELSE '✗'
        END as has_composition,
        CASE
          WHEN quality_test_id IS NOT NULL THEN '✓'
          ELSE '✗'
        END as has_quality,
        fat_percentage,
        protein_percentage,
        somatic_cell_count
      FROM milk_data_combined
      WHERE date >= CURRENT_DATE - INTERVAL '30 days'
      ORDER BY date DESC, session_type
      LIMIT 5
    `;

    const samples = await client.query(sampleQuery);

    if (samples.rows.length > 0) {
      console.log('Date       | Session  | Weight | Comp | Qual | Fat%  | Protein% | SCC');
      console.log('-----------|----------|--------|------|------|-------|----------|--------');
      samples.rows.forEach(row => {
        console.log(
          `${row.date.toISOString().split('T')[0]} | ` +
          `${row.session_type.padEnd(8)} | ` +
          `${(row.milk_weight_kg || 0).toString().padEnd(6)} | ` +
          `${row.has_composition.padEnd(4)} | ` +
          `${row.has_quality.padEnd(4)} | ` +
          `${(row.fat_percentage || '-').toString().padEnd(5)} | ` +
          `${(row.protein_percentage || '-').toString().padEnd(8)} | ` +
          `${(row.somatic_cell_count || '-').toString()}`
        );
      });
    } else {
      console.log('No recent records found');
    }

    console.log('\n✨ Migration completed successfully!');
    console.log('\n💡 The system will now automatically link future test records to milk weights.');

  } catch (err) {
    console.error('\n❌ Migration failed:');
    console.error(err.message);
    if (err.stack) {
      console.error('\nStack trace:');
      console.error(err.stack);
    }
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n👋 Database connection closed');
  }
}

applyMigration();
