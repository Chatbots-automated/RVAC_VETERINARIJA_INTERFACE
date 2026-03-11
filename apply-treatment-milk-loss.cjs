const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function applyMigration() {
  console.log('Applying Treatment Milk Loss Tracking Migration...\n');
  console.log('Reading SQL file...');

  try {
    const sql = fs.readFileSync('./treatment-milk-loss-migration.sql', 'utf8');

    console.log('Executing SQL...');

    // Split by statement and execute each one
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('/*'));

    for (const statement of statements) {
      if (statement.toLowerCase().includes('create') ||
          statement.toLowerCase().includes('grant') ||
          statement.toLowerCase().includes('comment')) {
        try {
          const { error } = await supabase.rpc('exec_sql', {
            sql_string: statement + ';'
          });

          if (error && !error.message.includes('already exists')) {
            console.log('Warning:', error.message.substring(0, 100));
          }
        } catch (e) {
          console.log('Note:', e.message.substring(0, 100));
        }
      }
    }

    console.log('\n✓ Migration execution completed!');
    console.log('\nTesting the new functions...\n');

    // Test the view
    const { data: testData, error: testError } = await supabase
      .from('treatment_milk_loss_summary')
      .select('*')
      .limit(5);

    if (testError) {
      console.log('❌ Error querying view:', testError.message);
      console.log('\nPlease apply the SQL manually in Supabase SQL Editor:');
      console.log('https://supabase.com/dashboard/project/YOUR_PROJECT/sql/new');
      console.log('\nCopy the contents from: treatment-milk-loss-migration.sql');
    } else {
      console.log(`✅ View works! Found ${testData?.length || 0} treatments with milk loss data`);

      if (testData && testData.length > 0) {
        const sample = testData[0];
        console.log('\n📊 Sample Treatment Milk Loss:');
        console.log(`  Animal: ${sample.animal_tag}`);
        console.log(`  Treatment Date: ${sample.treatment_date}`);
        console.log(`  Withdrawal Days: ${sample.withdrawal_days} + ${sample.safety_days} safety = ${sample.total_loss_days} total`);
        console.log(`  Avg Daily Milk: ${sample.avg_daily_milk_kg} kg/day`);
        console.log(`  Total Milk Lost: ${sample.total_milk_lost_kg} kg`);
        console.log(`  Value Lost: €${sample.total_value_lost_eur}`);

        if (sample.medications_used && sample.medications_used.length > 0) {
          console.log(`\n  Medications:`);
          sample.medications_used.forEach(med => {
            console.log(`    - ${med.product_name} (${med.qty} ${med.unit})`);
            console.log(`      Withdrawal: ${med.withdrawal_milk_days}d milk, ${med.withdrawal_meat_days}d meat`);
          });
        }
      }
    }

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    console.log('\nPlease apply the SQL manually in Supabase SQL Editor:');
    console.log('Copy contents from: treatment-milk-loss-migration.sql\n');
  }
}

applyMigration();
