import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

// Use service role key for admin operations
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

async function fixRLS() {
  console.log('Attempting to fix RLS policies...\n');

  // Test if we can access with service role
  console.log('1. Testing service role access to categories...');
  const { data: cats, error: catError } = await supabase
    .from('equipment_categories')
    .select('count');

  if (catError) {
    console.log('Error:', catError.message);
  } else {
    console.log(`✓ Service role can access equipment_categories\n`);
  }

  // Try to execute SQL via a stored procedure approach
  console.log('2. Checking for SQL execution capabilities...');

  // Let's try a workaround - disable RLS temporarily for these tables
  const sqlCommands = [
    // Categories policies
    `DROP POLICY IF EXISTS "Authenticated users can view equipment categories" ON equipment_categories CASCADE`,
    `DROP POLICY IF EXISTS "Authenticated users can manage equipment categories" ON equipment_categories CASCADE`,
    `DROP POLICY IF EXISTS "Authenticated users can insert equipment categories" ON equipment_categories CASCADE`,
    `DROP POLICY IF EXISTS "Authenticated users can update equipment categories" ON equipment_categories CASCADE`,
    `DROP POLICY IF EXISTS "Authenticated users can delete equipment categories" ON equipment_categories CASCADE`,

    `CREATE POLICY "Authenticated users can view equipment categories"
      ON equipment_categories FOR SELECT
      TO authenticated
      USING (true)`,

    `CREATE POLICY "Authenticated users can insert equipment categories"
      ON equipment_categories FOR INSERT
      TO authenticated
      WITH CHECK (true)`,

    `CREATE POLICY "Authenticated users can update equipment categories"
      ON equipment_categories FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true)`,

    `CREATE POLICY "Authenticated users can delete equipment categories"
      ON equipment_categories FOR DELETE
      TO authenticated
      USING (true)`,

    // Products policies
    `DROP POLICY IF EXISTS "Authenticated users can view equipment products" ON equipment_products CASCADE`,
    `DROP POLICY IF EXISTS "Authenticated users can manage equipment products" ON equipment_products CASCADE`,
    `DROP POLICY IF EXISTS "Authenticated users can insert equipment products" ON equipment_products CASCADE`,
    `DROP POLICY IF EXISTS "Authenticated users can update equipment products" ON equipment_products CASCADE`,
    `DROP POLICY IF EXISTS "Authenticated users can delete equipment products" ON equipment_products CASCADE`,

    `CREATE POLICY "Authenticated users can view equipment products"
      ON equipment_products FOR SELECT
      TO authenticated
      USING (true)`,

    `CREATE POLICY "Authenticated users can insert equipment products"
      ON equipment_products FOR INSERT
      TO authenticated
      WITH CHECK (true)`,

    `CREATE POLICY "Authenticated users can update equipment products"
      ON equipment_products FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true)`,

    `CREATE POLICY "Authenticated users can delete equipment products"
      ON equipment_products FOR DELETE
      TO authenticated
      USING (true)`,
  ];

  console.log('\nSQL commands to execute:');
  console.log('====================================');
  sqlCommands.forEach((cmd, i) => {
    console.log(`${i + 1}. ${cmd.substring(0, 80)}...`);
  });
  console.log('====================================\n');

  console.log('Please run these SQL commands in your Supabase SQL Editor:');
  console.log('Dashboard -> SQL Editor -> New Query\n');

  // Let's try using supabase-js directly for operations
  console.log('Testing if we can insert with service role...');
  const { data: testProduct, error: testError } = await supabase
    .from('equipment_products')
    .insert({
      name: 'Test Product with Service Role',
      unit_type: 'pcs',
      is_active: true,
    })
    .select();

  if (testError) {
    console.log('❌ Even service role cannot insert:', testError.message);
    console.log('\nThis means RLS is blocking even the service role.');
    console.log('You MUST run the SQL commands above in Supabase Dashboard');
  } else {
    console.log('✓ Service role CAN insert products!');
    console.log('\nThe issue is that your authenticated user session cannot insert.');
    console.log('The SQL commands above will fix this.\n');

    // Clean up
    if (testProduct && testProduct[0]) {
      await supabase.from('equipment_products').delete().eq('id', testProduct[0].id);
    }
  }
}

fixRLS();
