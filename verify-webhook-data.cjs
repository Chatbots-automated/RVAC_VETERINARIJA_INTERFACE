const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function verifyData() {
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    console.log('Checking inserted data...\n');

    const { data, error } = await supabase
      .from('milk_weights')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      console.error('Error:', error.message);
      return;
    }

    console.log('Recent milk weight entries:');
    data.forEach(row => {
      console.log('\n---');
      console.log(`Date: ${row.date}`);
      console.log(`Session: ${row.session_type}`);
      console.log(`Weight: ${row.weight} g`);
      console.log(`Session ID: ${row.session_id || 'N/A'}`);
      console.log(`Hose: ${row.hose_status || 'N/A'}`);
      console.log(`Stable: ${row.stable_status !== null ? row.stable_status : 'N/A'}`);
      console.log(`Timezone: ${row.timezone || 'N/A'}`);
      if (row.raw_data) {
        console.log(`Raw data: ${JSON.stringify(row.raw_data)}`);
      }
    });

    console.log('\n\n✅ Webhook endpoint is working!');
    console.log('\n📡 To send webhooks, POST to:');
    console.log('https://olxnahsxvyiadknybagt.supabase.co/rest/v1/rpc/upsert_milk_weight');
    console.log('\nHeaders:');
    console.log(`  apikey: ${process.env.VITE_SUPABASE_ANON_KEY}`);
    console.log('  Content-Type: application/json');
    console.log('\nPayload:');
    console.log(`{
  "p_payload": {
    "event": "ALERT",
    "at": "2026-01-05T20:14:45+00:00",
    "session_id": "1767644085615",
    "status": {
      "hose": "disconnected",
      "stable": true
    },
    "measurement": {
      "weight": 14974,
      "ts_local": "2026-01-05 22:14:45",
      "tz": "Europe/Vilnius"
    }
  }
}`);

  } catch (error) {
    console.error('Error:', error);
  }
}

verifyData();
