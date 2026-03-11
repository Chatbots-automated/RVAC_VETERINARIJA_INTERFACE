const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  console.log('=== FINDING PREVENTION ITEMS ===\n');

  const { data: recentBiocide } = await supabase
    .from('biocide_usage')
    .select('id, product_id, batch_id, qty, unit, purpose')
    .eq('purpose', 'Profilaktika')
    .not('batch_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!recentBiocide) {
    console.log('No Profilaktika items found');
    return;
  }

  console.log('Recent Profilaktika item:');
  console.log('  Batch ID:', recentBiocide.batch_id);
  console.log('  Product ID:', recentBiocide.product_id);
  console.log('  Qty:', recentBiocide.qty, recentBiocide.unit);
  console.log('');

  const { data: correspondingUsage } = await supabase
    .from('usage_items')
    .select('*')
    .eq('product_id', recentBiocide.product_id)
    .eq('batch_id', recentBiocide.batch_id)
    .eq('qty', recentBiocide.qty)
    .eq('purpose', 'Profilaktika');

  console.log('Looking for corresponding usage_item with same qty and purpose...');
  if (correspondingUsage && correspondingUsage.length > 0) {
    console.log('  ✅ Found', correspondingUsage.length, 'matching usage_items');
  } else {
    console.log('  ❌ NO matching usage_items found');
    console.log('  This proves prevention items are NOT deducting from stock!');
  }

  const { data: allBiocideForBatch, count: biocideCount } = await supabase
    .from('biocide_usage')
    .select('qty', { count: 'exact' })
    .eq('batch_id', recentBiocide.batch_id);

  const totalBiocideQty = allBiocideForBatch?.reduce((sum, b) => sum + parseFloat(b.qty), 0) || 0;

  const { data: allUsageForBatch, count: usageCount } = await supabase
    .from('usage_items')
    .select('qty', { count: 'exact' })
    .eq('batch_id', recentBiocide.batch_id);

  const totalUsageQty = allUsageForBatch?.reduce((sum, u) => sum + parseFloat(u.qty), 0) || 0;

  console.log('');
  console.log('For this batch:');
  console.log('  Records in biocide_usage:', biocideCount, '| Total qty:', totalBiocideQty);
  console.log('  Records in usage_items:', usageCount, '| Total qty:', totalUsageQty);
  console.log('  Missing from stock deduction:', totalBiocideQty, recentBiocide.unit);
})();
