import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function checkSchema() {
  console.log('Checking equipment_products schema...\n');

  const { data: products, error: productsError } = await supabase
    .from('equipment_products')
    .select('*')
    .limit(1);

  if (productsError) {
    console.log('equipment_products table error:', productsError.message);
  } else if (products && products.length > 0) {
    console.log('equipment_products columns:', Object.keys(products[0]));
  } else {
    console.log('equipment_products table exists but is empty');
  }

  console.log('\nChecking equipment_categories...\n');

  const { data: categories, error: categoriesError } = await supabase
    .from('equipment_categories')
    .select('*');

  if (categoriesError) {
    console.log('equipment_categories error:', categoriesError.message);
    console.log('Table likely does not exist - will need to create it');
  } else {
    console.log('equipment_categories found:', categories?.length || 0, 'categories');
    if (categories && categories.length > 0) {
      categories.forEach(cat => {
        console.log(`  - ${cat.name}: ${cat.description}`);
      });
    }
  }
}

checkSchema();
