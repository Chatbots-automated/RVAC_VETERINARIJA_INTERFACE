const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

async function applyFunction() {
  console.log('🔧 Applying webhook function...\n');

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    console.log('Checking milk_weights table...');
    const { data: columns, error: colError } = await supabase
      .from('milk_weights')
      .select('*')
      .limit(1);

    if (colError) {
      console.error('❌ Error checking table:', colError.message);
      return;
    }

    console.log('✅ Table exists');

    // Read and apply the SQL migration
    const sql = fs.readFileSync('./simplify-milk-weight-rpc.sql', 'utf8');

    console.log('\nApplying function...');

    // Use pg client for DDL operations
    const { Client } = require('pg');
    const client = new Client({
      connectionString: process.env.VITE_SUPABASE_DB_URL
    });

    await client.connect();

    try {
      // Execute the SQL
      await client.query(sql);
      console.log('✅ Function created successfully!');

      // Test the function
      console.log('\nTesting function with sample payload...');
      const testPayload = {
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
      };

      const result = await client.query(
        'SELECT upsert_milk_weight($1::jsonb)',
        [JSON.stringify(testPayload)]
      );

      console.log('✅ Test successful!');
      console.log('Result:', JSON.stringify(result.rows[0], null, 2));

    } finally {
      await client.end();
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
}

applyFunction();
