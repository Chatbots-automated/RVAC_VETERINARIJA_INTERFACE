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
  console.log('Applying RLS policy fixes using direct SQL...\n');

  // Read and execute each DROP POLICY command
  const dropCommands = [
    `DROP POLICY IF EXISTS "Authenticated users can view equipment categories" ON equipment_categories CASCADE`,
    `DROP POLICY IF EXISTS "Authenticated users can manage equipment categories" ON equipment_categories CASCADE`,
    `DROP POLICY IF EXISTS "Authenticated users can insert equipment categories" ON equipment_categories CASCADE`,
    `DROP POLICY IF EXISTS "Authenticated users can update equipment categories" ON equipment_categories CASCADE`,
    `DROP POLICY IF EXISTS "Authenticated users can delete equipment categories" ON equipment_categories CASCADE`,
    `DROP POLICY IF EXISTS "Authenticated users can view equipment products" ON equipment_products CASCADE`,
    `DROP POLICY IF EXISTS "Authenticated users can manage equipment products" ON equipment_products CASCADE`,
    `DROP POLICY IF EXISTS "Authenticated users can insert equipment products" ON equipment_products CASCADE`,
    `DROP POLICY IF EXISTS "Authenticated users can update equipment products" ON equipment_products CASCADE`,
    `DROP POLICY IF EXISTS "Authenticated users can delete equipment products" ON equipment_products CASCADE`,
  ];

  const createCommands = [
    // Categories
    `CREATE POLICY "Authenticated users can view equipment categories" ON equipment_categories FOR SELECT TO authenticated USING (true)`,
    `CREATE POLICY "Authenticated users can insert equipment categories" ON equipment_categories FOR INSERT TO authenticated WITH CHECK (true)`,
    `CREATE POLICY "Authenticated users can update equipment categories" ON equipment_categories FOR UPDATE TO authenticated USING (true) WITH CHECK (true)`,
    `CREATE POLICY "Authenticated users can delete equipment categories" ON equipment_categories FOR DELETE TO authenticated USING (true)`,
    // Products
    `CREATE POLICY "Authenticated users can view equipment products" ON equipment_products FOR SELECT TO authenticated USING (true)`,
    `CREATE POLICY "Authenticated users can insert equipment products" ON equipment_products FOR INSERT TO authenticated WITH CHECK (true)`,
    `CREATE POLICY "Authenticated users can update equipment products" ON equipment_products FOR UPDATE TO authenticated USING (true) WITH CHECK (true)`,
    `CREATE POLICY "Authenticated users can delete equipment products" ON equipment_products FOR DELETE TO authenticated USING (true)`,
  ];

  // Try through Supabase REST API directly
  const allCommands = [...dropCommands, ...createCommands];

  console.log('Total commands to execute:', allCommands.length);
  console.log('\nAttempting execution through Supabase service role...\n');

  // Since we can't execute arbitrary SQL through Supabase client,
  // let's use a workaround: temporarily disable and re-enable RLS

  console.log('Method 1: Trying to use PostgREST Admin API...');

  const { data, error } = await supabase.rpc('exec', {
    sql: allCommands.join(';\n')
  });

  if (error && error.message.includes('function') && error.message.includes('does not exist')) {
    console.log('❌ exec function does not exist\n');
    console.log('========================================');
    console.log('MANUAL FIX REQUIRED');
    console.log('========================================\n');
    console.log('Please follow these steps:');
    console.log('\n1. Go to your Supabase Dashboard:');
    console.log('   https://supabase.com/dashboard/project/olxnahsxvyiadknybagt');
    console.log('\n2. Click on "SQL Editor" in the left sidebar');
    console.log('\n3. Click "New Query"');
    console.log('\n4. Copy and paste the contents of fix-equipment-rls-policies.sql');
    console.log('\n5. Click "Run" or press Cmd/Ctrl + Enter\n');
    console.log('========================================\n');

    console.log('Alternatively, run these commands one by one:\n');
    allCommands.forEach((cmd, i) => {
      console.log(`-- Command ${i + 1}`);
      console.log(cmd + ';\n');
    });
  } else if (error) {
    console.log('Error:', error.message);
  } else {
    console.log('✓ Successfully executed all commands!');
  }
}

applyRLSFix();
