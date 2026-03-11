import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function findTestProduct() {
  console.log('Searching for products...\n');

  const { data: products } = await supabase
    .from('products')
    .select('id, name, qty, unit')
    .order('updated_at', { ascending: false })
    .limit(10);

  console.log('Recent products:');
  if (products) {
    for (const p of products) {
      console.log(`  ${p.name}: ${p.qty} ${p.unit}`);
    }
  }

  console.log('\n\nSearching for "test" or "produktas"...');

  const { data: testProducts } = await supabase
    .from('products')
    .select('*')
    .or('name.ilike.%test%,name.ilike.%produktas%');

  if (testProducts && testProducts.length > 0) {
    console.log('\nFound:');
    for (const p of testProducts) {
      console.log(`\n${p.name}:`);
      console.log(`  ID: ${p.id}`);
      console.log(`  Stock: ${p.qty} ${p.unit}`);

      const { data: batches } = await supabase
        .from('batches')
        .select('*')
        .eq('product_id', p.id);

      const batchCount = batches ? batches.length : 0;
      console.log(`  Batches: ${batchCount}`);
      if (batches && batches.length > 0) {
        for (const b of batches) {
          console.log(`    - ${b.batch_number}: ${b.qty_left}/${b.original_qty} (status: ${b.status})`);
        }
      }
    }
  } else {
    console.log('  None found');
  }
}

findTestProduct().catch(console.error);
