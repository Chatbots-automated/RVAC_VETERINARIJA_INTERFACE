const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function testFrontendQuery() {
  // This mimics what the frontend does
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
  );

  console.log('Testing milk_weights query (as frontend would do)...\n');

  // Test 1: Simple select
  console.log('Test 1: Simple select all');
  const { data: all, error: error1 } = await supabase
    .from('milk_weights')
    .select('*');

  if (error1) {
    console.log('❌ Error:', error1.message);
    console.log('Code:', error1.code);
    console.log('Details:', error1.details);
    console.log('Hint:', error1.hint);
  } else {
    console.log(`✅ Success! Found ${all?.length || 0} records`);
    if (all && all.length > 0) {
      console.log('Sample record:', JSON.stringify(all[0], null, 2));
    }
  }

  // Test 2: With date filter
  console.log('\nTest 2: With date filter');
  const dateFrom = '2026-01-01';
  const dateTo = '2026-12-31';

  const { data: filtered, error: error2 } = await supabase
    .from('milk_weights')
    .select('*')
    .gte('date', dateFrom)
    .lte('date', dateTo)
    .order('date', { ascending: false });

  if (error2) {
    console.log('❌ Error:', error2.message);
  } else {
    console.log(`✅ Success! Found ${filtered?.length || 0} records with filter`);
  }

  // Test 3: Check if authenticated context makes a difference
  console.log('\nTest 3: Checking authentication requirement...');
  const { data: session } = await supabase.auth.getSession();

  if (session.session) {
    console.log('✅ User is authenticated');
  } else {
    console.log('ℹ️  User is NOT authenticated (using anon key only)');
  }
}

testFrontendQuery();
