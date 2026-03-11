import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function checkRLS() {
  console.log('\n=== CHECKING TEAT_STATUS RLS POLICIES ===\n');

  const { data, error } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT
        schemaname,
        tablename,
        policyname,
        permissive,
        roles,
        cmd,
        qual,
        with_check
      FROM pg_policies
      WHERE tablename = 'teat_status'
      ORDER BY policyname;
    `
  });

  if (error) {
    console.error('Error:', error);

    // Try alternative approach
    console.log('\nTrying alternative query...\n');
    const { data: altData, error: altError } = await supabase
      .from('pg_policies')
      .select('*')
      .eq('tablename', 'teat_status');

    if (altError) {
      console.error('Alternative query also failed:', altError);
    } else {
      console.table(altData);
    }
  } else {
    console.table(data);
  }
}

checkRLS().catch(console.error);
