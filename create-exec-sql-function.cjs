require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  console.log('=== CREATING exec_sql HELPER FUNCTION ===\n');

  // First, let's try to execute SQL using Supabase's REST API directly
  const url = `${process.env.VITE_SUPABASE_URL}/rest/v1/rpc/exec_sql`;

  const createExecSQL = `
    CREATE OR REPLACE FUNCTION exec_sql(sql text)
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    BEGIN
      EXECUTE sql;
    END;
    $$;
  `;

  try {
    const response = await fetch(`${process.env.VITE_SUPABASE_URL}/rest/v1/`, {
      method: 'POST',
      headers: {
        'apikey': process.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${process.env.VITE_SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ query: createExecSQL })
    });

    console.log('Response status:', response.status);
    const text = await response.text();
    console.log('Response:', text);

  } catch (error) {
    console.log('❌ Error:', error.message);
    console.log('\nThe trigger needs to be applied manually through Supabase Dashboard.');
    console.log('Instructions are in APPLY_VISIT_MEDICATION_FIX.md');
  }
})();
