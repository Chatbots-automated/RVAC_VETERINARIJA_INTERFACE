const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function applyFix() {
  console.log('🔧 Testing current milk_weights access...\n');

  // Test with anon key first
  const anonSupabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
  );

  console.log('Testing with anon key (public access)...');
  const { data: anonData, error: anonError } = await anonSupabase
    .from('milk_weights')
    .select('*')
    .limit(1);

  if (anonError) {
    console.log('❌ Cannot read with anon key');
    console.log('Error:', anonError.message);
    console.log('\n📋 You need to apply the RLS fix:');
    console.log('1. Visit: https://supabase.com/dashboard/project/olxnahsxvyiadknybagt/sql/new');
    console.log('2. Copy the entire contents from: fix-milk-weights-rls.sql');
    console.log('3. Click "Run"');
    console.log('\nThis will allow public read access to milk_weights data.');
  } else {
    console.log('✅ Anon key can read milk_weights!');
    if (anonData && anonData.length > 0) {
      console.log(`Found ${anonData.length} record(s)`);
    }
  }

  // Test with service role
  console.log('\nTesting with service role key...');
  const serviceSupabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: serviceData, error: serviceError } = await serviceSupabase
    .from('milk_weights')
    .select('*')
    .limit(1);

  if (serviceError) {
    console.log('❌ Cannot read with service role:', serviceError.message);
  } else {
    console.log('✅ Service role can read milk_weights');
    if (serviceData && serviceData.length > 0) {
      console.log(`Found ${serviceData.length} record(s)`);
      console.log('Sample:', JSON.stringify(serviceData[0], null, 2));
    }
  }
}

applyFix();
