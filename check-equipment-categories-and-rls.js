import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function checkCategoriesAndRLS() {
  console.log('1. Checking equipment_categories...\n');

  const { data: categories, error: categoriesError } = await supabase
    .from('equipment_categories')
    .select('*')
    .order('name');

  if (categoriesError) {
    console.log('Error loading categories:', categoriesError);
  } else {
    console.log(`Found ${categories?.length || 0} categories:`);
    categories?.forEach(cat => {
      console.log(`  - ${cat.name} (ID: ${cat.id})`);
    });
  }

  console.log('\n2. Testing product insert...\n');

  const testProduct = {
    name: 'Test Product',
    product_code: 'TEST001',
    category_id: categories?.[0]?.id || null,
    unit_type: 'pcs',
    manufacturer: 'Test Manufacturer',
    description: 'Test description',
    min_stock_level: 10,
    is_active: true,
  };

  const { data: newProduct, error: insertError } = await supabase
    .from('equipment_products')
    .insert(testProduct)
    .select();

  if (insertError) {
    console.log('Insert error:', insertError);
    console.log('\nThis is an RLS policy issue. Need to fix the policies.');
  } else {
    console.log('Insert successful!');
    console.log('Product created:', newProduct);

    // Clean up test product
    await supabase.from('equipment_products').delete().eq('id', newProduct[0].id);
    console.log('Test product cleaned up');
  }
}

checkCategoriesAndRLS();
