import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function fixRLS() {
  console.log('Fixing RLS policies for equipment tables...\n');

  // Fix equipment_categories RLS
  console.log('1. Fixing equipment_categories RLS...');
  const categoriesRLS = `
    DROP POLICY IF EXISTS "Authenticated users can view equipment categories" ON equipment_categories;
    DROP POLICY IF EXISTS "Authenticated users can manage equipment categories" ON equipment_categories;

    CREATE POLICY "Authenticated users can view equipment categories"
      ON equipment_categories FOR SELECT
      TO authenticated
      USING (true);

    CREATE POLICY "Authenticated users can manage equipment categories"
      ON equipment_categories FOR INSERT
      TO authenticated
      WITH CHECK (true);

    CREATE POLICY "Authenticated users can update equipment categories"
      ON equipment_categories FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);

    CREATE POLICY "Authenticated users can delete equipment categories"
      ON equipment_categories FOR DELETE
      TO authenticated
      USING (true);
  `;

  const { error: catError } = await supabase.rpc('exec_sql', { sql: categoriesRLS });
  if (catError) {
    console.log('Error fixing categories RLS:', catError.message);
  } else {
    console.log('✓ Categories RLS fixed');
  }

  // Fix equipment_products RLS
  console.log('\n2. Fixing equipment_products RLS...');
  const productsRLS = `
    DROP POLICY IF EXISTS "Authenticated users can view equipment products" ON equipment_products;
    DROP POLICY IF EXISTS "Authenticated users can manage equipment products" ON equipment_products;

    CREATE POLICY "Authenticated users can view equipment products"
      ON equipment_products FOR SELECT
      TO authenticated
      USING (true);

    CREATE POLICY "Authenticated users can insert equipment products"
      ON equipment_products FOR INSERT
      TO authenticated
      WITH CHECK (true);

    CREATE POLICY "Authenticated users can update equipment products"
      ON equipment_products FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);

    CREATE POLICY "Authenticated users can delete equipment products"
      ON equipment_products FOR DELETE
      TO authenticated
      USING (true);
  `;

  const { error: prodError } = await supabase.rpc('exec_sql', { sql: productsRLS });
  if (prodError) {
    console.log('Error fixing products RLS:', prodError.message);
  } else {
    console.log('✓ Products RLS fixed');
  }

  console.log('\nDone! Testing now...');

  // Test categories
  const { data: cats, error: testCatError } = await supabase
    .from('equipment_categories')
    .select('*')
    .limit(5);

  if (testCatError) {
    console.log('Still having issues with categories:', testCatError.message);
  } else {
    console.log(`✓ Can now read ${cats?.length || 0} categories`);
  }

  // Test product insert
  const { error: testProdError } = await supabase
    .from('equipment_products')
    .insert({
      name: 'RLS Test Product',
      unit_type: 'pcs',
      is_active: true,
    })
    .select();

  if (testProdError) {
    console.log('Still having issues with product insert:', testProdError.message);
  } else {
    console.log('✓ Can now insert products');
  }
}

fixRLS();
