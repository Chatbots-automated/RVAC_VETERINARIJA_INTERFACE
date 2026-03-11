import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function checkAllBatches() {
  console.log('🔍 Checking ALL BioBos Respi 4 batches...\n');

  // Get the product
  const { data: products } = await supabase
    .from('products')
    .select('id, name')
    .ilike('name', '%BioBos Respi 4%');

  if (!products || products.length === 0) {
    console.log('❌ Product not found');
    return;
  }

  const product = products[0];
  console.log(`Product: ${product.name}`);
  console.log(`Product ID: ${product.id}\n`);

  // Get ALL batches for this product
  const { data: batches } = await supabase
    .from('batches')
    .select('*')
    .eq('product_id', product.id)
    .order('created_at', { ascending: true });

  if (!batches || batches.length === 0) {
    console.log('❌ No batches found');
    return;
  }

  console.log(`Found ${batches.length} batches\n`);
  console.log('═══════════════════════════════════════════════════════════════════════════════════════');
  console.log('LOT          | Created    | Pkg Size | Pkg Count | Received | Qty Left | Status');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════');

  let totalReceived = 0;
  let totalQtyLeft = 0;

  for (const batch of batches) {
    totalReceived += batch.received_qty || 0;
    totalQtyLeft += batch.qty_left || 0;

    const calculated = (batch.package_size || 0) * (batch.package_count || 0);
    const mismatch = Math.abs(calculated - batch.received_qty) > 0.01;

    console.log(
      `${(batch.lot || 'N/A').padEnd(12)} | ${batch.created_at.substring(0, 10)} | ${batch.package_size.toString().padStart(8)} | ${batch.package_count.toString().padStart(9)} | ${batch.received_qty.toString().padStart(8)} | ${batch.qty_left.toString().padStart(8)}${batch.qty_left < 0 ? ' ⚠️' : '   '} | ${batch.status}${mismatch ? ' ⚠️ CALC MISMATCH' : ''}`
    );

    // Get usage count for this batch
    const { data: usageItems } = await supabase
      .from('usage_items')
      .select('qty')
      .eq('batch_id', batch.id);

    const totalUsed = usageItems?.reduce((sum, u) => sum + u.qty, 0) || 0;
    const expectedQtyLeft = batch.received_qty - totalUsed;

    if (Math.abs(expectedQtyLeft - batch.qty_left) > 0.01) {
      console.log(`   ⚠️  Expected qty_left: ${expectedQtyLeft}, Actual: ${batch.qty_left}, Diff: ${expectedQtyLeft - batch.qty_left}`);
    }

    console.log(`   Usage: ${totalUsed} ml from ${usageItems?.length || 0} usage_items`);
  }

  console.log('═══════════════════════════════════════════════════════════════════════════════════════');
  console.log(`TOTALS: Received: ${totalReceived} ml | Qty Left: ${totalQtyLeft} ml | Used: ${totalReceived - totalQtyLeft} ml`);
  console.log('═══════════════════════════════════════════════════════════════════════════════════════');
}

checkAllBatches().catch(console.error);
