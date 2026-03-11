const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function checkColumns() {
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    console.log('Checking milk_weights table columns...\n');

    // Get a sample row to see current structure
    const { data: sample, error } = await supabase
      .from('milk_weights')
      .select('*')
      .limit(1);

    if (error) {
      console.error('Error:', error.message);
      return;
    }

    if (sample && sample.length > 0) {
      console.log('Current columns:');
      Object.keys(sample[0]).forEach(col => {
        console.log(`  - ${col}: ${typeof sample[0][col]}`);
      });
    } else {
      console.log('No data in table yet');
    }

    // Check if function exists
    console.log('\nChecking if upsert_milk_weight function exists...');
    const { data: funcTest, error: funcError } = await supabase.rpc('upsert_milk_weight', {
      p_payload: {
        event: 'ALERT',
        at: '2026-01-05T20:14:45+00:00',
        session_id: '1767644085615',
        status: {
          hose: 'disconnected',
          stable: true
        },
        measurement: {
          weight: 14974,
          ts_local: '2026-01-05 22:14:45',
          tz: 'Europe/Vilnius'
        }
      }
    });

    if (funcError) {
      console.log('❌ Function does not exist or has wrong signature');
      console.log('Error:', funcError.message);
      console.log('\n📋 You need to apply the migration manually:');
      console.log('1. Visit: https://supabase.com/dashboard/project/olxnahsxvyiadknybagt/sql/new');
      console.log('2. Copy the entire contents from: simplify-milk-weight-rpc.sql');
      console.log('3. Click "Run"');
    } else {
      console.log('✅ Function exists and works!');
      console.log('Result:', JSON.stringify(funcTest, null, 2));
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

checkColumns();
