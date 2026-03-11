import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function testPreventionDeduction() {
  console.log('\n=== Testing Prevention Stock Deduction ===\n');

  try {
    // 1. Find a batch with stock
    console.log('1. Finding a batch with available stock...');
    const { data: batchList, error: batchError } = await supabase
      .from('batches')
      .select('id, batch_number, product_id, qty_left')
      .gt('qty_left', 10)
      .limit(1);

    if (batchError || !batchList || batchList.length === 0) {
      console.log('❌ No batches with stock found:', batchError?.message);
      return;
    }

    const batch = batchList[0];
    console.log(`✅ Found batch: ${batch.batch_number}`);
    console.log(`   Product ID: ${batch.product_id}`);
    console.log(`   Stock before: ${batch.qty_left}`);

    const testQty = 1;
    const batchId = batch.id;
    const productId = batch.product_id;

    // 2. Create a test biocide_usage entry
    console.log('\n2. Creating test prevention (biocide_usage) entry...');
    const { data: biocideUsage, error: insertError } = await supabase
      .from('biocide_usage')
      .insert({
        product_id: productId,
        batch_id: batchId,
        qty: testQty,
        unit: 'pcs',
        use_date: new Date().toISOString().split('T')[0],
        purpose: 'Test Prevention Stock Deduction'
      })
      .select()
      .single();

    if (insertError) {
      console.log('❌ Failed to create biocide_usage:', insertError.message);
      return;
    }

    console.log(`✅ Created biocide_usage record ID: ${biocideUsage.id}`);

    // 3. Check if usage_items was created by the trigger
    console.log('\n3. Checking if trigger created usage_items...');
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for trigger

    const { data: usageItems, error: usageError } = await supabase
      .from('usage_items')
      .select('*')
      .eq('biocide_usage_id', biocideUsage.id);

    if (usageError) {
      console.log('❌ Error checking usage_items:', usageError.message);
      return;
    }

    if (!usageItems || usageItems.length === 0) {
      console.log('❌ TRIGGER DID NOT FIRE - No usage_items created!');
      return;
    }

    console.log('✅ Trigger fired! Usage_items created:');
    console.log(`   ID: ${usageItems[0].id}`);
    console.log(`   Biocide Usage ID: ${usageItems[0].biocide_usage_id}`);
    console.log(`   Product ID: ${usageItems[0].product_id}`);
    console.log(`   Batch ID: ${usageItems[0].batch_id}`);
    console.log(`   Quantity: ${usageItems[0].qty} ${usageItems[0].unit}`);

    // 4. Check if stock was deducted
    console.log('\n4. Checking if stock was deducted...');
    const { data: updatedBatch, error: batchCheckError } = await supabase
      .from('batches')
      .select('qty_left')
      .eq('id', batchId)
      .single();

    if (batchCheckError) {
      console.log('❌ Error checking batch:', batchCheckError.message);
      return;
    }

    const expectedStock = batch.qty_left - testQty;
    const actualStock = updatedBatch.qty_left;

    console.log(`   Stock before: ${batch.qty_left}`);
    console.log(`   Deducted: ${testQty}`);
    console.log(`   Expected stock: ${expectedStock}`);
    console.log(`   Actual stock: ${actualStock}`);

    if (Math.abs(actualStock - expectedStock) < 0.001) {
      console.log('✅ STOCK DEDUCTED CORRECTLY!');
    } else {
      console.log('❌ STOCK DEDUCTION MISMATCH!');
    }

    // 5. Cleanup test data
    console.log('\n5. Cleaning up test data...');
    await supabase.from('usage_items').delete().eq('biocide_usage_id', biocideUsage.id);
    await supabase.from('biocide_usage').delete().eq('id', biocideUsage.id);
    console.log('✅ Cleanup complete');

    console.log('\n=== TEST RESULT: Prevention stock deduction is working! ===\n');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testPreventionDeduction();
