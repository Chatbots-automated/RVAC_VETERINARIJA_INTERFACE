import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function scanAllProducts() {
  console.log('🔬 Scanning ALL products for stock discrepancies...\n');

  // Get all batches with their products
  const { data: batches } = await supabase
    .from('batches')
    .select('id, product_id, lot, received_qty, products(name)')
    .order('product_id');

  // Group by product
  const productMap = new Map();

  for (const batch of batches || []) {
    if (!productMap.has(batch.product_id)) {
      productMap.set(batch.product_id, {
        name: batch.products.name,
        batches: []
      });
    }
    productMap.get(batch.product_id).batches.push(batch);
  }

  console.log(`Found ${productMap.size} products with batches\n`);

  const issues = [];

  for (const [productId, productData] of productMap) {
    let totalReceived = 0;
    let totalUsed = 0;
    let negativeBatches = [];

    for (const batch of productData.batches) {
      totalReceived += batch.received_qty || 0;

      const { data: usage } = await supabase
        .from('usage_items')
        .select('qty')
        .eq('batch_id', batch.id);

      const used = usage?.reduce((sum, u) => sum + Number(u.qty), 0) || 0;
      totalUsed += used;

      const onHand = (batch.received_qty || 0) - used;
      if (onHand < 0) {
        negativeBatches.push({
          lot: batch.lot,
          received: batch.received_qty,
          used,
          onHand
        });
      }
    }

    const correctStock = totalReceived - totalUsed;
    const inventoryStock = productData.batches
      .reduce((sum, batch) => {
        const usage = batch.usage || 0;
        const onHand = (batch.received_qty || 0) - usage;
        return onHand > 0 ? sum + onHand : sum;
      }, 0);

    if (negativeBatches.length > 0) {
      issues.push({
        name: productData.name,
        correctStock,
        negativeBatches
      });
    }
  }

  if (issues.length === 0) {
    console.log('✅ No products with negative batch stock found!');
  } else {
    console.log(`⚠️  Found ${issues.length} products with negative batch stock:\n`);

    for (const issue of issues) {
      console.log(`📦 ${issue.name}`);
      console.log(`   Correct stock: ${issue.correctStock}`);
      console.log(`   Negative batches:`);
      for (const batch of issue.negativeBatches) {
        console.log(`      ${batch.lot}: ${batch.received} received, ${batch.used} used = ${batch.onHand} ml ❌`);
      }
      console.log('');
    }

    console.log(`\n💡 These products were showing INCORRECT stock in Atsargos tab`);
    console.log(`   because negative batches were filtered out.`);
    console.log(`   The fix has been applied - they will now show correct totals.`);
  }
}

scanAllProducts().catch(console.error);
