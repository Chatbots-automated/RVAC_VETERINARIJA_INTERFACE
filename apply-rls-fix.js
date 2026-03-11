import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';

dotenv.config();

// Use service role key
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

async function applyRLSFix() {
  console.log('Applying RLS policy fixes...\n');

  const sql = readFileSync('/tmp/cc-agent/59000172/project/fix-equipment-rls-policies.sql', 'utf8');

  // Split into individual statements
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('--') && s.length > 10);

  console.log(`Found ${statements.length} SQL statements to execute\n`);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const preview = stmt.substring(0, 70).replace(/\n/g, ' ');

    try {
      // Try executing via rpc
      const { error } = await supabase.rpc('exec_sql', { sql: stmt + ';' });

      if (error) {
        throw error;
      }

      console.log(`✓ ${i + 1}/${statements.length}: ${preview}...`);
      successCount++;
    } catch (error) {
      console.log(`✗ ${i + 1}/${statements.length}: ${preview}...`);
      console.log(`  Error: ${error.message}`);
      errorCount++;
    }
  }

  console.log(`\nResults: ${successCount} succeeded, ${errorCount} failed`);

  if (errorCount > 0) {
    console.log('\n⚠️  Some statements failed. You may need to run the SQL manually in Supabase Dashboard.');
    console.log('The SQL file is at: fix-equipment-rls-policies.sql\n');
  } else {
    console.log('\n✓ All RLS policies have been fixed!\n');

    // Test the fix
    console.log('Testing the fix...');
    const { data: cats, error: catError } = await supabase
      .from('equipment_categories')
      .select('*')
      .limit(5);

    if (catError) {
      console.log('❌ Still have category access issues:', catError.message);
    } else {
      console.log(`✓ Can access ${cats?.length || 0} categories`);
    }
  }
}

applyRLSFix();
