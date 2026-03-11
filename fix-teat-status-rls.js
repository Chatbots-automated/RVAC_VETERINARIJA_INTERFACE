import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function fixTeatStatusRLS() {
  console.log('\n=== FIXING TEAT_STATUS RLS POLICIES ===\n');

  const migration = `
    -- Drop existing policies
    DROP POLICY IF EXISTS "Authenticated users can view teat status" ON teat_status;
    DROP POLICY IF EXISTS "Authenticated users can insert teat status" ON teat_status;
    DROP POLICY IF EXISTS "Authenticated users can update teat status" ON teat_status;
    DROP POLICY IF EXISTS "Authenticated users can delete teat status" ON teat_status;

    -- Keep RLS enabled for security
    ALTER TABLE teat_status ENABLE ROW LEVEL SECURITY;

    -- Create permissive policies for anon role
    CREATE POLICY "Allow all reads"
      ON teat_status
      FOR SELECT
      USING (true);

    CREATE POLICY "Allow all inserts"
      ON teat_status
      FOR INSERT
      WITH CHECK (true);

    CREATE POLICY "Allow all updates"
      ON teat_status
      FOR UPDATE
      USING (true)
      WITH CHECK (true);

    CREATE POLICY "Allow all deletes"
      ON teat_status
      FOR DELETE
      USING (true);
  `;

  // Split into individual statements and execute
  const statements = migration
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  for (const statement of statements) {
    console.log(`Executing: ${statement.substring(0, 80)}...`);

    const { data, error } = await supabase.rpc('exec_sql', {
      sql: statement
    });

    if (error) {
      console.error('❌ Error:', error.message);

      // Try using pg library if RPC fails
      console.log('Trying direct database connection...');
      try {
        const pg = await import('pg');
        const { Client } = pg.default;

        // Parse the database URL from env
        const dbUrl = process.env.VITE_SUPABASE_DB_URL;
        console.log('DB URL:', dbUrl ? 'present' : 'missing');

        if (!dbUrl) {
          throw new Error('VITE_SUPABASE_DB_URL not found in environment');
        }

        const client = new Client({
          connectionString: dbUrl,
          ssl: { rejectUnauthorized: false }
        });

        await client.connect();
        console.log('Connected to database');
        await client.query(statement);
        await client.end();
        console.log('✅ Success (via pg)');
      } catch (pgError) {
        console.error('❌ pg error:', pgError.message);
        console.error('Full error:', pgError);
        throw pgError;
      }
    } else {
      console.log('✅ Success');
    }
  }

  console.log('\n✅ TEAT_STATUS RLS POLICIES FIXED\n');
}

fixTeatStatusRLS().catch(console.error);
