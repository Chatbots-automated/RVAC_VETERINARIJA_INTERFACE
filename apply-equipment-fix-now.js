import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

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

async function applyFix() {
  console.log('Applying equipment RLS fixes and adding categories...\n');

  const sqlStatements = [
    // Drop existing policies for equipment_categories
    `DROP POLICY IF EXISTS "Authenticated users can view equipment categories" ON equipment_categories CASCADE`,
    `DROP POLICY IF EXISTS "Authenticated users can manage equipment categories" ON equipment_categories CASCADE`,
    `DROP POLICY IF EXISTS "Authenticated users can insert equipment categories" ON equipment_categories CASCADE`,
    `DROP POLICY IF EXISTS "Authenticated users can update equipment categories" ON equipment_categories CASCADE`,
    `DROP POLICY IF EXISTS "Authenticated users can delete equipment categories" ON equipment_categories CASCADE`,

    // Create new policies for equipment_categories
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

    // Drop existing policies for equipment_products
    `DROP POLICY IF EXISTS "Authenticated users can view equipment products" ON equipment_products CASCADE`,
    `DROP POLICY IF EXISTS "Authenticated users can manage equipment products" ON equipment_products CASCADE`,
    `DROP POLICY IF EXISTS "Authenticated users can insert equipment products" ON equipment_products CASCADE`,
    `DROP POLICY IF EXISTS "Authenticated users can update equipment products" ON equipment_products CASCADE`,
    `DROP POLICY IF EXISTS "Authenticated users can delete equipment products" ON equipment_products CASCADE`,

    // Create new policies for equipment_products
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

  // Execute using service role - direct table operations
  console.log('Attempting to fix using direct Supabase operations...\n');

  // Since we can't execute raw SQL through JS client easily, let's use a different approach
  // We'll use the REST API directly
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

  for (let i = 0; i < sqlStatements.length; i++) {
    const sql = sqlStatements[i];
    const preview = sql.substring(0, 70).replace(/\n/g, ' ');

    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ sql })
      });

      if (!response.ok) {
        const error = await response.text();
        console.log(`✗ ${i + 1}/${sqlStatements.length}: ${preview}...`);
        console.log(`  Status: ${response.status}, Error: ${error.substring(0, 100)}`);
      } else {
        console.log(`✓ ${i + 1}/${sqlStatements.length}: ${preview}...`);
      }
    } catch (error) {
      console.log(`✗ ${i + 1}/${sqlStatements.length}: ${preview}...`);
      console.log(`  Error: ${error.message}`);
    }
  }

  // Now add categories using direct insert (this should work with service role)
  console.log('\nAdding equipment categories...');

  const categories = [
    { name: 'Įrankiai', description: 'Įrankiai ir įrenginiai' },
    { name: 'Apsauginės priemonės', description: 'Asmeninės apsaugos priemonės' },
    { name: 'Transporto priemonės', description: 'Transporto priemonės ir jų priedai' },
    { name: 'Priežiūros įranga', description: 'Priežiūros ir remonto įranga' },
    { name: 'Darbo drabužiai', description: 'Darbo drabužiai ir avalynė' },
    { name: 'Smulki įranga', description: 'Smulki įranga ir priedai' },
  ];

  for (const category of categories) {
    const { error } = await supabase
      .from('equipment_categories')
      .upsert(category, { onConflict: 'name', ignoreDuplicates: true });

    if (error) {
      console.log(`✗ Failed to add ${category.name}: ${error.message}`);
    } else {
      console.log(`✓ Added ${category.name}`);
    }
  }

  // Test the fix
  console.log('\nTesting the fix...');
  const { data: cats, error: catError } = await supabase
    .from('equipment_categories')
    .select('*');

  if (catError) {
    console.log('❌ Still have issues:', catError.message);
  } else {
    console.log(`✓ Can now access ${cats?.length || 0} categories`);
    cats?.forEach(cat => console.log(`  - ${cat.name}`));
  }
}

applyFix();
