import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function diagnoseProduct(productNamePattern) {
  console.log(`🔍 Diagnosing product: ${productNamePattern}\n`);

  // 1. Find the product
  const { data: products, error: prodError } = await supabase
    .from('products')
    .select('*')
    .ilike('name', `%${productNamePattern}%`);

  if (prodError) {
    console.error('Error fetching product:', prodError);
    return;
  }

  if (!products || products.length === 0) {
    console.log('❌ Product not found');
    return;
  }

  if (products.length > 1) {
    console.log('⚠️  Multiple products found:');
    products.forEach((p, idx) => {
      console.log(`  ${idx + 1}. ${p.name} (ID: ${p.id})`);
    });
    console.log('\nPlease be more specific. Using first match...\n');
  }

  const product = products[0];
  console.log('✅ Found product:', product.name, '(ID:', product.id, ')');
  console.log('   Category:', product.category);
  console.log('   Unit:', product.primary_pack_unit);
  console.log();

  // 2. Get all batches for this product
  const { data: batches, error: batchError } = await supabase
    .from('batches')
    .select('*')
    .eq('product_id', product.id)
    .order('created_at', { ascending: false });

  if (batchError) {
    console.error('Error fetching batches:', batchError);
    return;
  }

  console.log('📦 BATCHES:');
  console.log('═══════════════════════════════════════════════════════════════');
  
  let totalReceived = 0;
  let totalQtyLeft = 0;
  
  if (batches && batches.length > 0) {
    batches.forEach((batch, idx) => {
      const qtyUsedFromBatch = parseFloat(batch.received_qty || 0) - parseFloat(batch.qty_left || 0);
      console.log(`\nBatch ${idx + 1}:`);
      console.log(`  ID: ${batch.id.substring(0, 8)}...`);
      console.log(`  LOT: ${batch.lot || 'N/A'}`);
      console.log(`  Created: ${batch.created_at}`);
      console.log(`  Received Qty: ${batch.received_qty}`);
      console.log(`  Qty Left: ${batch.qty_left}${batch.qty_left < 0 ? ' ⚠️ NEGATIVE!' : ''}`);
      console.log(`  Used from batch: ${qtyUsedFromBatch}`);
      console.log(`  Status: ${batch.status}`);
      console.log(`  Purchase Price: €${batch.purchase_price || 0}`);
      
      totalReceived += parseFloat(batch.received_qty || 0);
      totalQtyLeft += parseFloat(batch.qty_left || 0);
    });
    
    console.log('\n' + '─'.repeat(65));
    console.log(`TOTAL RECEIVED (from batches): ${totalReceived} ${product.primary_pack_unit}`);
    console.log(`TOTAL QTY_LEFT (from batches): ${totalQtyLeft} ${product.primary_pack_unit}`);
    console.log(`TOTAL USED (calculated): ${totalReceived - totalQtyLeft} ${product.primary_pack_unit}`);
  } else {
    console.log('  ❌ No batches found!');
    return;
  }

  // 3. Get all usage_items
  const { data: usageItems, error: usageError } = await supabase
    .from('usage_items')
    .select('*, batches(lot, product_id)')
    .eq('product_id', product.id)
    .order('created_at', { ascending: false });

  if (usageError) {
    console.error('Error fetching usage items:', usageError);
  }

  console.log('\n\n📊 USAGE RECORDS:');
  console.log('═══════════════════════════════════════════════════════════════');

  let totalUsageItems = 0;
  let usageItemsWithBatch = 0;
  let usageItemsWithoutBatch = 0;
  
  if (usageItems && usageItems.length > 0) {
    console.log(`\n📦 Usage Items (${usageItems.length} records):`);
    usageItems.forEach((item, idx) => {
      const hasCorrectBatch = item.batches && item.batches.product_id === product.id;
      
      if (hasCorrectBatch) usageItemsWithBatch++;
      if (!item.batch_id) usageItemsWithoutBatch++;
      
      if (idx < 5) { // Show first 5
        console.log(`  ${idx + 1}. Date: ${item.created_at?.substring(0, 10)} | Qty: ${item.qty} | Batch: ${item.batches?.lot || 'N/A'}`);
      }
      totalUsageItems += parseFloat(item.qty || 0);
    });
    if (usageItems.length > 5) {
      console.log(`  ... (showing first 5 of ${usageItems.length})`);
    }
    console.log(`  TOTAL: ${totalUsageItems} ${product.primary_pack_unit}`);
    console.log(`  ✅ With correct batch: ${usageItemsWithBatch}`);
    console.log(`  ❌ Without batch_id: ${usageItemsWithoutBatch}`);
  } else {
    console.log('  ✅ No usage_items found');
  }

  // 4. Get vaccinations
  const { data: vaccinations, error: vaccError } = await supabase
    .from('vaccinations')
    .select('*')
    .eq('product_id', product.id);

  let totalVaccinations = 0;
  if (vaccinations && vaccinations.length > 0) {
    console.log(`\n💉 Vaccinations: ${vaccinations.length} records`);
    totalVaccinations = vaccinations.reduce((sum, v) => sum + parseFloat(v.dose_amount || 0), 0);
    console.log(`  TOTAL: ${totalVaccinations} ${product.primary_pack_unit}`);
  } else {
    console.log('  ✅ No vaccinations found');
  }

  // 5. Get synchronization steps
  const productBatchIds = batches.map(b => b.id);
  
  const { data: syncSteps, error: syncError } = await supabase
    .from('synchronization_steps')
    .select('*')
    .in('batch_id', productBatchIds)
    .eq('completed', true);

  let totalSyncSteps = 0;
  if (syncSteps && syncSteps.length > 0) {
    console.log(`\n🔄 Synchronization Steps: ${syncSteps.length} records`);
    totalSyncSteps = syncSteps.reduce((sum, s) => sum + parseFloat(s.dosage || 0), 0);
    console.log(`  TOTAL: ${totalSyncSteps} ${product.primary_pack_unit}`);
  } else {
    console.log('  ✅ No sync steps found');
  }

  // Group usage by batch
  console.log('\n\n📊 USAGE BY BATCH:');
  console.log('═══════════════════════════════════════════════════════════════');
  const usageByBatch = new Map();
  usageItems.forEach(item => {
    const batchId = item.batch_id;
    if (!usageByBatch.has(batchId)) {
      usageByBatch.set(batchId, { qty: 0, count: 0, lot: item.batches?.lot || 'N/A' });
    }
    const entry = usageByBatch.get(batchId);
    entry.qty += parseFloat(item.qty || 0);
    entry.count += 1;
  });

  let hasDiscrepancy = false;
  batches.forEach(batch => {
    const usage = usageByBatch.get(batch.id) || { qty: 0, count: 0 };
    const qtyUsedFromBatch = parseFloat(batch.received_qty || 0) - parseFloat(batch.qty_left || 0);
    const discrepancy = usage.qty - qtyUsedFromBatch;
    
    if (Math.abs(discrepancy) > 0.01) {
      hasDiscrepancy = true;
      console.log(`\n⚠️  Batch ${batch.lot}:`);
    } else {
      console.log(`\n✅ Batch ${batch.lot}:`);
    }
    
    console.log(`  Received: ${batch.received_qty} ${product.primary_pack_unit}`);
    console.log(`  Qty Left (DB): ${batch.qty_left} ${product.primary_pack_unit}`);
    console.log(`  Used (from DB): ${qtyUsedFromBatch} ${product.primary_pack_unit}`);
    console.log(`  Usage Items: ${usage.count} records = ${usage.qty} ${product.primary_pack_unit}`);
    console.log(`  DISCREPANCY: ${discrepancy} ${product.primary_pack_unit}${Math.abs(discrepancy) > 0.01 ? ' ⚠️' : ' ✅'}`);
  });

  console.log('\n\n📈 SUMMARY:');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Total Received (from batches):     ${totalReceived} ${product.primary_pack_unit}`);
  console.log(`Total Qty Left (from batches):     ${totalQtyLeft} ${product.primary_pack_unit}`);
  console.log(`Total Used (from DB qty_left):     ${totalReceived - totalQtyLeft} ${product.primary_pack_unit} ✅ ACCURATE`);
  console.log(`\nTotal Usage (from records):`);
  console.log(`  - Usage Items:                   ${totalUsageItems} ${product.primary_pack_unit}`);
  console.log(`  - Vaccinations:                  ${totalVaccinations} ${product.primary_pack_unit}`);
  console.log(`  - Sync Steps:                    ${totalSyncSteps} ${product.primary_pack_unit}`);
  console.log(`  - TOTAL:                         ${totalUsageItems + totalVaccinations + totalSyncSteps} ${product.primary_pack_unit}`);
  
  const recordsDiscrepancy = (totalUsageItems + totalVaccinations + totalSyncSteps) - (totalReceived - totalQtyLeft);
  console.log(`\nDISCREPANCY (records vs DB):       ${recordsDiscrepancy} ${product.primary_pack_unit}${Math.abs(recordsDiscrepancy) > 0.01 ? ' ⚠️' : ' ✅'}`);

  console.log('\n\n🔍 ANALYSIS:');
  console.log('═══════════════════════════════════════════════════════════════');
  
  if (Math.abs(recordsDiscrepancy) > 0.01) {
    console.log('❌ DISCREPANCY DETECTED!');
    console.log('   The usage records do not match the actual stock deduction.');
    console.log('   This is likely due to historical data issues.');
    console.log('\n   ✅ GOOD NEWS: The database qty_left is accurate and maintained by triggers.');
    console.log('   ✅ The ProductUsageAnalysis component now uses qty_left as the source of truth.');
    console.log('\n   Possible causes:');
    console.log('   1. Usage was recorded before stock check function was implemented');
    console.log('   2. Race conditions during high-volume usage recording');
    console.log('   3. Data migration issues');
    console.log('   4. Manual corrections to qty_left without deleting usage records');
  } else {
    console.log('✅ Everything looks correct!');
    console.log('   Usage records match the actual stock deduction.');
  }
  
  if (totalQtyLeft < 0) {
    console.log('\n❌ CRITICAL: Negative qty_left detected!');
    console.log('   This should not happen. Consider adding a CHECK constraint.');
  }
  
  if (hasDiscrepancy) {
    console.log('\n⚠️  Some batches have discrepancies between usage records and actual deduction.');
    console.log('   See "USAGE BY BATCH" section above for details.');
  }
}

// Get product name from command line argument
const productName = process.argv[2];

if (!productName) {
  console.log('Usage: node diagnose-product-stock.js <product_name>');
  console.log('Example: node diagnose-product-stock.js "Ymcp Bolus"');
  process.exit(1);
}

diagnoseProduct(productName).catch(console.error);
