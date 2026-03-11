const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  console.log('=== TESTING PREVENTION STOCK DEDUCTION ===\n');

  // Get a batch with both biocide_usage and usage_items
  const { data: batches } = await supabase
    .from('batches')
    .select('id, product_id, received_qty, qty_left')
    .not('qty_left', 'is', null)
    .limit(10);

  if (!batches || batches.length === 0) {
    console.log('No batches found');
    return;
  }

  // Find a batch that has biocide_usage records
  let testBatch = null;
  for (const batch of batches) {
    const { data: biocideRecords } = await supabase
      .from('biocide_usage')
      .select('id, qty')
      .eq('batch_id', batch.id);

    if (biocideRecords && biocideRecords.length > 0) {
      testBatch = batch;
      break;
    }
  }

  if (!testBatch) {
    console.log('No batches with biocide_usage records found');
    return;
  }

  console.log('Testing batch:', testBatch.id.substring(0, 8) + '...');
  console.log('Received qty:', testBatch.received_qty);
  console.log('Qty left:', testBatch.qty_left);
  console.log('');

  // Get all biocide_usage for this batch
  const { data: biocideRecords } = await supabase
    .from('biocide_usage')
    .select('id, qty, unit, purpose, created_at')
    .eq('batch_id', testBatch.id)
    .order('created_at', { ascending: true });

  const totalBiocide = biocideRecords?.reduce((sum, b) => sum + parseFloat(b.qty), 0) || 0;

  console.log('BIOCIDE_USAGE TABLE:');
  console.log(`  Records: ${biocideRecords?.length || 0}`);
  console.log(`  Total qty: ${totalBiocide}`);
  console.log('');

  // Get all usage_items for this batch
  const { data: usageRecords } = await supabase
    .from('usage_items')
    .select('id, qty, unit, purpose, created_at')
    .eq('batch_id', testBatch.id)
    .order('created_at', { ascending: true });

  const totalUsage = usageRecords?.reduce((sum, u) => sum + parseFloat(u.qty), 0) || 0;

  console.log('USAGE_ITEMS TABLE:');
  console.log(`  Records: ${usageRecords?.length || 0}`);
  console.log(`  Total qty: ${totalUsage}`);
  console.log('');

  // Calculate expected stock
  const expectedQtyLeft = testBatch.received_qty - totalUsage;
  const actualQtyLeft = testBatch.qty_left;

  console.log('STOCK CALCULATION:');
  console.log(`  Received: ${testBatch.received_qty}`);
  console.log(`  Used (from usage_items): ${totalUsage}`);
  console.log(`  Expected qty_left: ${expectedQtyLeft}`);
  console.log(`  Actual qty_left: ${actualQtyLeft}`);
  console.log('');

  // Check if stock matches
  if (Math.abs(expectedQtyLeft - actualQtyLeft) < 0.01) {
    console.log('✅ Stock calculation is correct!');
  } else {
    console.log('⚠️  Stock calculation mismatch');
  }

  // Compare biocide_usage vs usage_items
  console.log('');
  console.log('PREVENTION STOCK DEDUCTION CHECK:');

  // Count how many biocide_usage records have corresponding usage_items
  let matchedCount = 0;
  let unmatchedCount = 0;

  for (const biocide of biocideRecords || []) {
    const hasMatch = usageRecords?.some(u =>
      Math.abs(u.qty - biocide.qty) < 0.01 &&
      Math.abs(new Date(u.created_at).getTime() - new Date(biocide.created_at).getTime()) < 1000
    );

    if (hasMatch) {
      matchedCount++;
    } else {
      unmatchedCount++;
    }
  }

  console.log(`  biocide_usage records with usage_items: ${matchedCount}/${biocideRecords?.length || 0}`);
  console.log(`  biocide_usage records WITHOUT usage_items: ${unmatchedCount}`);
  console.log('');

  if (unmatchedCount === 0 && biocideRecords && biocideRecords.length > 0) {
    console.log('✅✅✅ PREVENTION STOCK DEDUCTION IS WORKING!');
    console.log('All prevention items are creating usage_items and deducting from stock.');
  } else if (unmatchedCount > 0) {
    console.log('❌ FIX NOT YET APPLIED or INCOMPLETE');
    console.log(`${unmatchedCount} prevention items are missing from usage_items.`);
    console.log('Apply fix-prevention-stock-deduction.sql to fix this.');
  } else {
    console.log('No prevention items found in this batch to test.');
  }
})();
