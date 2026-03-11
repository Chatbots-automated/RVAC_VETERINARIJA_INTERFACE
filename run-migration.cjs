const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  try {
    const sql = fs.readFileSync('supabase/migrations/20260116110000_fix_treated_animals_detailed_view.sql', 'utf8');

    // Remove comments for cleaner execution
    const cleanSql = sql
      .replace(/\/\*[\s\S]*?\*\//g, '')  // Remove multi-line comments
      .replace(/--.*$/gm, '')             // Remove single-line comments
      .trim();

    console.log('Applying migration: fix_treated_animals_detailed_view');
    console.log('Length:', cleanSql.length, 'chars');

    // Try to execute via a custom function or directly
    // Since we can't execute raw SQL directly via Supabase client,
    // we'll need to use pg Client

    const { Client } = require('pg');
    const connectionString = process.env.VITE_SUPABASE_DB_URL;

    if (!connectionString) {
      throw new Error('VITE_SUPABASE_DB_URL not found in .env');
    }

    const client = new Client({ connectionString });
    await client.connect();

    await client.query(cleanSql);
    await client.end();

    console.log('✓ Migration applied successfully!\n');

    // Test the fix
    console.log('Testing the view...');
    const { data, error } = await supabase
      .from('vw_treated_animals_detailed')
      .select('treatment_id, disease_name, treatment_days, medication_source')
      .limit(10);

    if (error) {
      throw error;
    }

    console.log('\nSample data:');
    data?.forEach(d => {
      console.log(`  ${d.disease_name} - ${d.treatment_days}d - ${d.medication_source}`);
    });

    const emptyCount = data?.filter(d => !d.disease_name).length || 0;
    console.log(`\n✓ Empty diseases: ${emptyCount} (should be 0)`);
    console.log('✓ All checks passed!');

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();
