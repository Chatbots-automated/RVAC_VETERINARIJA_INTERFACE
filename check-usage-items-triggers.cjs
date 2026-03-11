const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function checkTriggers() {
  console.log('Checking triggers on usage_items table...\n');
  
  const { data, error } = await supabase.rpc('exec_sql', {
    sql_query: `
      SELECT 
        tgname as trigger_name,
        tgtype,
        tgenabled,
        pg_get_triggerdef(oid) as trigger_definition
      FROM pg_trigger
      WHERE tgrelid = 'usage_items'::regclass
      AND tgisinternal = false
      ORDER BY tgname;
    `
  });

  if (error) {
    console.log('Error:', error.message);
    console.log('\nTrying alternative method...');
    
    // Try to get function that's being called
    const { data: funcData, error: funcError } = await supabase.rpc('exec_sql', {
      sql_query: `
        SELECT 
          proname as function_name,
          pg_get_functiondef(oid) as definition
        FROM pg_proc
        WHERE proname LIKE '%usage%constraint%'
        OR proname LIKE '%check_usage%'
        ORDER BY proname;
      `
    });
    
    if (funcError) {
      console.log('Function check error:', funcError.message);
    } else {
      console.log('Functions related to usage constraints:');
      console.log(JSON.stringify(funcData, null, 2));
    }
  } else {
    console.log('Triggers on usage_items:');
    console.log(JSON.stringify(data, null, 2));
  }
}

checkTriggers();
