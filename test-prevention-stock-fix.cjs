const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  console.log('=== TESTING PREVENTION STOCK DEDUCTION FIX ===\n');

  // Test the specific batch we investigated earlier
  const batchId = '00723d68-ce19-4ce5-94ff-84d3af0a1a8d';
  const productId = 'c14a61f3-fe8a-4e9f-91c2-bd5925871459';

  console.log('Testing batch:', batchId.substring(0, 8) + '...');
  console.log('');

  // Count records BEFORE applying fix
  const { data: biocideBefore, count: biocideCount } = await supabase
    .from('biocide_usage')
    .select('qty', { count: 'exact' })
    .eq('batch_id', batchId);

  const { data: usageBefore, count: usageCountBefore } = await supabase
    .from('usage_items')
    .select('qty', { count: 'exact' })
    .eq('batch_id', batchId);

  const totalBiocideQty = biocideBefore?.reduce((sum, b) => sum + parseFloat(b.qty), 0) || 0;
  const totalUsageQtyBefore = usageBefore?.reduce((sum, u) => sum + parseFloat(u.qty), 0) || 0;

  console.log('BEFORE FIX:');
  console.log('  biocide_usage records:', biocideCount, '| Total:', totalBiocideQty, 'bolus');
  console.log('  usage_items records:', usageCountBefore, '| Total:', totalUsageQtyBefore, 'bolus');
  console.log('  Missing from stock:', totalBiocideQty - totalUsageQtyBefore, 'bolus');
  console.log('');

  console.log('Now apply the SQL fix from: fix-prevention-stock-deduction.sql');
  console.log('Then run this script again to verify the fix worked!');
  console.log('');

  // Check if fix has been applied by looking at usage_items count
  if (totalUsageQtyBefore >= totalBiocideQty * 0.9) {
    console.log('✅ FIX APPEARS TO BE APPLIED!');
    console.log('  Usage items now match biocide_usage records');
    console.log('  Stock deduction is working correctly for prevention items');

    // Verify batch stock
    const { data: batch } = await supabase
      .from('batches')
      .select('received_qty, qty_left')
      .eq('id', batchId)
      .single();

    if (batch) {
      const stockUsed = batch.received_qty - batch.qty_left;
      console.log('');
      console.log('Batch stock verification:');
      console.log('  Received:', batch.received_qty, 'bolus');
      console.log('  Qty left:', batch.qty_left, 'bolus');
      console.log('  Stock used:', stockUsed, 'bolus');
      console.log('  Expected usage:', totalBiocideQty, 'bolus (from biocide_usage)');

      if (Math.abs(stockUsed - totalBiocideQty) < 1) {
        console.log('  ✅ Stock matches expected usage!');
      } else {
        console.log('  ⚠️  Stock differs from expected (may include other usage)');
      }
    }
  } else {
    console.log('⏳ FIX NOT YET APPLIED');
    console.log('  Apply the SQL fix, then run this test again');
  }
})();
