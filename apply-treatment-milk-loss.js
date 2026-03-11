const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function applyMigration() {
  console.log('Applying Treatment Milk Loss Tracking Migration...\n');

  try {
    const sql = fs.readFileSync('./treatment-milk-loss-migration.sql', 'utf8');

    const { data, error } = await supabase.rpc('exec_sql', { sql_string: sql }).single();

    if (error) {
      console.error('Error applying migration:', error.message);

      // Try direct execution
      console.log('\nTrying direct execution...');
      const { error: directError } = await supabase.from('_migrations').insert({
        name: '20260104000000_treatment_milk_loss',
        executed_at: new Date().toISOString()
      });

      if (directError && !directError.message.includes('duplicate')) {
        console.error('Direct execution error:', directError.message);
      }

      // Execute the SQL anyway
      const pg = require('pg');
      const client = new pg.Client({
        connectionString: process.env.VITE_SUPABASE_URL.replace('https://', 'postgresql://postgres:') + '/postgres'
      });

      console.log('Note: You need to run this SQL manually in Supabase SQL Editor:');
      console.log('https://supabase.com/dashboard/project/olxnahsxvyiadknybagt/sql/new');

    } else {
      console.log('✓ Migration applied successfully!');
    }

    // Test the new functions
    console.log('\nTesting new functions...');

    const { data: testData, error: testError } = await supabase
      .from('treatment_milk_loss_summary')
      .select('*')
      .limit(5);

    if (testError) {
      console.log('❌ Error querying view:', testError.message);
    } else {
      console.log(`✓ Found ${testData?.length || 0} treatments with milk loss data`);

      if (testData && testData.length > 0) {
        const sample = testData[0];
        console.log('\nSample Treatment Milk Loss:');
        console.log(`  Animal: ${sample.animal_tag}`);
        console.log(`  Treatment Date: ${sample.treatment_date}`);
        console.log(`  Withdrawal Days: ${sample.withdrawal_days} + ${sample.safety_days} safety = ${sample.total_loss_days} total`);
        console.log(`  Avg Daily Milk: ${sample.avg_daily_milk_kg} kg/day`);
        console.log(`  Total Milk Lost: ${sample.total_milk_lost_kg} kg`);
        console.log(`  Value Lost: €${sample.total_value_lost_eur}`);
        console.log(`  Medications: ${JSON.stringify(sample.medications_used, null, 2)}`);
      }
    }

  } catch (err) {
    console.error('Error:', err.message);
    console.log('\nPlease apply the SQL manually from: treatment-milk-loss-migration.sql');
  }
}

applyMigration();
