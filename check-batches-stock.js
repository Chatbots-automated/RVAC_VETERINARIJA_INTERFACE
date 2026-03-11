import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function checkBatchStock() {
  console.log('Checking test produktas batches and stock\n');

  // Find test produktas
  const { data: product } = await supabase
    .from('products')
    .select('*')
    .ilike('name', '%test%')
    .maybeSingle();

  if (!product) {
    console.log('No test product found');
    return;
  }

  console.log('Product:', product.name);
  console.log('ID:', product.id);
  console.log('Total stock:', product.qty, product.unit);
  console.log('');

  // Get all batches
  const { data: batches } = await supabase
    .from('batches')
    .select('*')
    .eq('product_id', product.id)
    .order('created_at', { ascending: false });

  console.log('Batches:');
  if (batches && batches.length > 0) {
    for (const batch of batches) {
      console.log(`  Batch ${batch.batch_number}:`);
      console.log(`    qty_left: ${batch.qty_left}`);
      console.log(`    original_qty: ${batch.original_qty}`);
      console.log(`    status: ${batch.status}`);
      console.log(`    created: ${batch.created_at}`);
      console.log('');
    }
  } else {
    console.log('  NO BATCHES FOUND!');
    console.log('');
  }

  // Check usage_items for this product
  const { data: usageItems } = await supabase
    .from('usage_items')
    .select('*, batches(batch_number, qty_left)')
    .eq('product_id', product.id)
    .order('created_at', { ascending: false })
    .limit(5);

  console.log('Recent usage_items:');
  if (usageItems && usageItems.length > 0) {
    for (const item of usageItems) {
      console.log(`  qty: ${item.qty}, batch: ${item.batches?.batch_number}, batch_left: ${item.batches?.qty_left}`);
    }
  } else {
    console.log('  No usage items found');
  }
}

checkBatchStock().catch(console.error);
