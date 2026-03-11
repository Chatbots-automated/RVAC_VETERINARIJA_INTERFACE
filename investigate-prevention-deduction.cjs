const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  console.log('=== INVESTIGATING PREVENTION DEDUCTIONS ===\n');

  const batchId = '00723d68-ce19-4ce5-94ff-84d3af0a1a8d';
  const productId = 'c14a61f3-fe8a-4e9f-91c2-bd5925871459';

  console.log('Batch:', batchId);
  console.log('Product:', productId);
  console.log('');

  const { data: biocideRecords } = await supabase
    .from('biocide_usage')
    .select('id, qty, purpose, use_date, created_at')
    .eq('batch_id', batchId)
    .order('created_at', { ascending: true });

  console.log('All biocide_usage records for this batch:');
  biocideRecords?.forEach((b, i) => {
    console.log(`  ${i + 1}. ${b.qty} bolus | Purpose: ${b.purpose} | Date: ${b.use_date}`);
  });
  console.log(`  TOTAL: ${biocideRecords?.reduce((sum, b) => sum + b.qty, 0)} bolus`);
  console.log('');

  const { data: usageRecords } = await supabase
    .from('usage_items')
    .select('id, qty, purpose, created_at')
    .eq('batch_id', batchId)
    .order('created_at', { ascending: true });

  console.log('All usage_items records for this batch:');
  usageRecords?.forEach((u, i) => {
    console.log(`  ${i + 1}. ${u.qty} bolus | Purpose: ${u.purpose}`);
  });
  console.log(`  TOTAL: ${usageRecords?.reduce((sum, u) => sum + u.qty, 0)} bolus`);
  console.log('');

  const profilaktikaRecords = biocideRecords?.filter(b => b.purpose === 'Profilaktika') || [];
  const profilaktikaInUsageItems = usageRecords?.filter(u => u.purpose === 'Profilaktika') || [];

  console.log('BREAKDOWN:');
  console.log(`  Profilaktika in biocide_usage: ${profilaktikaRecords.length} records, ${profilaktikaRecords.reduce((s, b) => s + b.qty, 0)} bolus`);
  console.log(`  Profilaktika in usage_items: ${profilaktikaInUsageItems.length} records, ${profilaktikaInUsageItems.reduce((s, u) => s + u.qty, 0)} bolus`);
  console.log('');

  if (profilaktikaRecords.length > profilaktikaInUsageItems.length) {
    console.log('❌ PROBLEM CONFIRMED:');
    console.log(`  ${profilaktikaRecords.length - profilaktikaInUsageItems.length} Profilaktika records are missing from usage_items`);
    console.log('  Stock is NOT being deducted for these prevention items!');
  }
})();
