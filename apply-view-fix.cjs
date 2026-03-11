const { Client } = require('pg');
const fs = require('fs');
require('dotenv').config();

(async () => {
  // Get the connection string from environment
  const connectionString = process.env.VITE_SUPABASE_DB_URL;

  if (!connectionString) {
    console.error('Error: VITE_SUPABASE_DB_URL not found in .env');
    process.exit(1);
  }

  const client = new Client({ connectionString });

  try {
    await client.connect();
    console.log('Connected to database');

    const sql = fs.readFileSync('fix-treated-animals-view.sql', 'utf8');

    console.log('Applying view fix...');
    await client.query(sql);
    console.log('✓ View updated successfully!');

    // Test the fix
    console.log('\nTesting the view...');
    const result = await client.query(`
      SELECT treatment_id, disease_name, treatment_days, medication_source
      FROM vw_treated_animals_detailed
      LIMIT 10
    `);

    console.log('\nSample data:');
    result.rows.forEach(d => {
      console.log(`  ${d.disease_name || 'NULL'} - ${d.treatment_days}d - ${d.medication_source}`);
    });

    const emptyCount = result.rows.filter(d => !d.disease_name).length;
    console.log(`\n✓ Empty diseases: ${emptyCount} (should be 0)`);

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
})();
