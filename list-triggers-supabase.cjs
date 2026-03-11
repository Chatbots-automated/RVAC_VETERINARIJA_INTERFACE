const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  // Use the rpc method to execute raw SQL (if available)
  const { data, error } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT
        t.tgname as trigger_name,
        t.tgenabled as enabled,
        pg_get_triggerdef(t.oid) as trigger_def
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      WHERE c.relname = 'usage_items'
      AND NOT t.tgisinternal
      ORDER BY t.tgname;
    `
  });

  if (error) {
    console.log('Error:', error);
    console.log('\nTrying alternative approach...');

    // Alternative: Check if there's a function that's supposed to be triggered
    const { data: functions } = await supabase.rpc('exec_sql', {
      sql: `
        SELECT proname as function_name
        FROM pg_proc
        WHERE proname LIKE '%usage%item%' OR proname LIKE '%withdrawal%'
        ORDER BY proname;
      `
    });

    console.log('Functions related to usage_items or withdrawal:', functions);
    return;
  }

  console.log('=== Triggers on usage_items table ===\n');

  if (!data || data.length === 0) {
    console.log('❌ No triggers found on usage_items!');
    console.log('\nThis explains why withdrawal dates are not being calculated!');
  } else {
    data.forEach(row => {
      console.log(`Trigger: ${row.trigger_name}`);
      console.log(`Enabled: ${row.enabled}`);
      console.log(`Definition:\n${row.trigger_def}\n`);
    });
  }
})();
