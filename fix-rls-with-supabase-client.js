import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://olxnahsxvyiadknybagt.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9seG5haHN4dnlpYWRrbnliYWd0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mjc3MTc4NiwiZXhwIjoyMDY4MzQ3Nzg2fQ.PvB43f77FD-zVVO8Kf_OxJ5pUQg3xbDA7nuL4S3Dt5U';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function fixRLS() {
  console.log('Starting RLS policy fix...\n');

  // Test if we can access with service role
  console.log('1. Testing service role access...');
  const { data: cats, error: catError } = await supabase
    .from('equipment_categories')
    .select('*')
    .limit(5);

  if (catError) {
    console.log('❌ Error accessing categories:', catError.message);
  } else {
    console.log(`✓ Service role can access ${cats?.length || 0} categories\n`);
  }

  // List all SQL statements to execute
  const sqlStatements = [
    // Drop policies for equipment_categories
    `DROP POLICY IF EXISTS "Authenticated users can view equipment categories" ON equipment_categories CASCADE`,
    `DROP POLICY IF EXISTS "Authenticated users can manage equipment categories" ON equipment_categories CASCADE`,
    `DROP POLICY IF EXISTS "Authenticated users can insert equipment categories" ON equipment_categories CASCADE`,
    `DROP POLICY IF EXISTS "Authenticated users can update equipment categories" ON equipment_categories CASCADE`,
    `DROP POLICY IF EXISTS "Authenticated users can delete equipment categories" ON equipment_categories CASCADE`,

    // Create new policies for equipment_categories
    `CREATE POLICY "Authenticated users can view equipment categories" ON equipment_categories FOR SELECT TO authenticated USING (true)`,
    `CREATE POLICY "Authenticated users can insert equipment categories" ON equipment_categories FOR INSERT TO authenticated WITH CHECK (true)`,
    `CREATE POLICY "Authenticated users can update equipment categories" ON equipment_categories FOR UPDATE TO authenticated USING (true) WITH CHECK (true)`,
    `CREATE POLICY "Authenticated users can delete equipment categories" ON equipment_categories FOR DELETE TO authenticated USING (true)`,

    // Drop policies for equipment_products
    `DROP POLICY IF EXISTS "Authenticated users can view equipment products" ON equipment_products CASCADE`,
    `DROP POLICY IF EXISTS "Authenticated users can manage equipment products" ON equipment_products CASCADE`,
    `DROP POLICY IF EXISTS "Authenticated users can insert equipment products" ON equipment_products CASCADE`,
    `DROP POLICY IF EXISTS "Authenticated users can update equipment products" ON equipment_products CASCADE`,
    `DROP POLICY IF EXISTS "Authenticated users can delete equipment products" ON equipment_products CASCADE`,

    // Create new policies for equipment_products
    `CREATE POLICY "Authenticated users can view equipment products" ON equipment_products FOR SELECT TO authenticated USING (true)`,
    `CREATE POLICY "Authenticated users can insert equipment products" ON equipment_products FOR INSERT TO authenticated WITH CHECK (true)`,
    `CREATE POLICY "Authenticated users can update equipment products" ON equipment_products FOR UPDATE TO authenticated USING (true) WITH CHECK (true)`,
    `CREATE POLICY "Authenticated users can delete equipment products" ON equipment_products FOR DELETE TO authenticated USING (true)`,
  ];

  console.log('2. Executing SQL statements via Supabase REST API...\n');

  // Try to execute each SQL statement via fetch
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < sqlStatements.length; i++) {
    const sql = sqlStatements[i];
    const preview = sql.substring(0, 70).replace(/\n/g, ' ');

    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SERVICE_KEY,
          'Authorization': `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({ query: sql })
      });

      if (response.ok) {
        console.log(`✓ ${i + 1}/${sqlStatements.length}: ${preview}...`);
        successCount++;
      } else {
        const error = await response.text();
        console.log(`✗ ${i + 1}/${sqlStatements.length}: ${preview}...`);
        console.log(`  Status: ${response.status}`);
        failCount++;
      }
    } catch (error) {
      console.log(`✗ ${i + 1}/${sqlStatements.length}: ${preview}...`);
      console.log(`  Error: ${error.message}`);
      failCount++;
    }
  }

  console.log(`\n========================================`);
  console.log(`Results: ${successCount} succeeded, ${failCount} failed`);
  console.log(`========================================\n`);

  if (failCount === sqlStatements.length) {
    console.log('⚠️  Could not execute SQL via API.\n');
    console.log('MANUAL FIX REQUIRED:');
    console.log('==========================================\n');
    console.log('Please run these SQL commands in your Supabase Dashboard:');
    console.log('1. Go to: https://supabase.com/dashboard/project/olxnahsxvyiadknybagt');
    console.log('2. Click "SQL Editor" → "New Query"');
    console.log('3. Paste and run:\n');

    sqlStatements.forEach(sql => {
      console.log(sql + ';');
    });

    console.log('\n==========================================\n');
  } else {
    console.log('✓ RLS policies fixed!\n');
    console.log('Next steps:');
    console.log('  1. Refresh your browser (F5)');
    console.log('  2. Categories should now appear in dropdown');
    console.log('  3. Product creation should work\n');
  }
}

fixRLS();
