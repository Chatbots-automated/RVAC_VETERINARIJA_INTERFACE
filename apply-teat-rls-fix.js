import 'dotenv/config';

async function fixTeatStatusRLS() {
  console.log('\n=== FIXING TEAT_STATUS RLS POLICIES ===\n');

  const statements = [
    `DROP POLICY IF EXISTS "Authenticated users can view teat status" ON teat_status`,
    `DROP POLICY IF EXISTS "Authenticated users can insert teat status" ON teat_status`,
    `DROP POLICY IF EXISTS "Authenticated users can update teat status" ON teat_status`,
    `DROP POLICY IF EXISTS "Authenticated users can delete teat status" ON teat_status`,
    `CREATE POLICY "Allow all reads" ON teat_status FOR SELECT USING (true)`,
    `CREATE POLICY "Allow all inserts" ON teat_status FOR INSERT WITH CHECK (true)`,
    `CREATE POLICY "Allow all updates" ON teat_status FOR UPDATE USING (true) WITH CHECK (true)`,
    `CREATE POLICY "Allow all deletes" ON teat_status FOR DELETE USING (true)`,
  ];

  for (const statement of statements) {
    console.log(`\nExecuting: ${statement.substring(0, 80)}...`);

    try {
      const response = await fetch(
        `${process.env.VITE_SUPABASE_URL}/rest/v1/rpc/exec_raw_sql`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${process.env.VITE_SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({ query: statement }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        console.error('❌ HTTP Error:', response.status, error);

        // If RPC doesn't exist, try using SQL editor endpoint
        console.log('Trying alternative SQL execution method...');

        const altResponse = await fetch(
          `${process.env.VITE_SUPABASE_URL}/rest/v1/`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': process.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
              'Authorization': `Bearer ${process.env.VITE_SUPABASE_SERVICE_ROLE_KEY}`,
              'Prefer': 'params=single-object'
            },
            body: JSON.stringify({
              query: statement
            }),
          }
        );

        if (!altResponse.ok) {
          console.error('❌ Alternative method also failed:', altResponse.status);
          throw new Error(`Failed to execute statement: ${statement}`);
        }
      }

      console.log('✅ Success');
    } catch (error) {
      console.error('❌ Error:', error.message);
      throw error;
    }
  }

  console.log('\n✅ ALL POLICIES UPDATED\n');
}

fixTeatStatusRLS().catch(console.error);
