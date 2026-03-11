const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function checkPolicies() {
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
  );

  console.log('Checking RLS policies for milk_weights table...\n');

  // Query the policies
  const { data, error } = await supabase.rpc('exec_sql', {
    query: `
      SELECT
        polname as policy_name,
        polcmd as command,
        polpermissive as permissive,
        pol_roles.rolname as role_name,
        pg_get_expr(polqual, polrelid) as using_expression,
        pg_get_expr(polwithcheck, polrelid) as with_check_expression
      FROM pg_policy
      JOIN pg_class ON pg_policy.polrelid = pg_class.oid
      LEFT JOIN pg_roles pol_roles ON pol_roles.oid = ANY(pg_policy.polroles)
      WHERE pg_class.relname = 'milk_weights'
      ORDER BY polname;
    `
  }).catch((e) => {
    console.log('Could not query policies directly, checking with alternative method...\n');
    return { data: null, error: e };
  });

  if (error || !data) {
    console.log('Using alternative method to check policies...\n');

    // Try to read with anon key
    const anonSupabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.VITE_SUPABASE_ANON_KEY
    );

    const { data: testData, error: testError } = await anonSupabase
      .from('milk_weights')
      .select('count')
      .limit(1);

    if (testError) {
      console.log('❌ Anon key cannot read milk_weights');
      console.log('Error:', testError.message);
      console.log('\nYou need to apply the RLS fix from fix-milk-weights-rls.sql');
    } else {
      console.log('✅ Anon key CAN read milk_weights');
      console.log('RLS policies are configured correctly');
    }
  } else {
    console.log('Current RLS policies:');
    console.log(JSON.stringify(data, null, 2));
  }
}

checkPolicies();
