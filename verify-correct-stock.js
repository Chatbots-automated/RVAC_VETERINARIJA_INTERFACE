import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function verifyCorrectStock() {
  console.log('🔬 Verifying correct stock for BioBos RCC...\n');

  const { data: product } = await supabase
    .from('products')
    .select('*')
    .eq('name', 'BioBos RCC inj.susp. 10 ml')
    .single();

  console.log(`📦 ${product.name}\n`);

  // Get all batches
  const { data: batches } = await supabase
    .from('batches')
    .select('*')
    .eq('product_id', product.id);

  const totalReceivedFromBatches = batches?.reduce((sum, b) => sum + Number(b.received_qty || 0), 0) || 0;

  console.log(`📥 TOTAL RECEIVED (from batches table):`);
  batches?.forEach(b => {
    console.log(`   ${b.lot}: ${b.received_qty} ml`);
  });
  console.log(`   TOTAL: ${totalReceivedFromBatches} ml\n`);

  // Get all usage
  const { data: allUsage } = await supabase
    .from('usage_items')
    .select('qty, batch_id, vaccination_id, treatment_id')
    .eq('product_id', product.id);

  const totalUsed = allUsage?.reduce((sum, u) => sum + Number(u.qty), 0) || 0;
  const vaccinationCount = allUsage?.filter(u => u.vaccination_id).length || 0;
  const treatmentCount = allUsage?.filter(u => u.treatment_id).length || 0;

  console.log(`📤 TOTAL USED (from usage_items table):`);
  console.log(`   Treatments: ${treatmentCount} records`);
  console.log(`   Vaccinations: ${vaccinationCount} records`);
  console.log(`   TOTAL: ${totalUsed} ml\n`);

  const correctStock = totalReceivedFromBatches - totalUsed;

  console.log(`✅ CORRECT STOCK CALCULATION:`);
  console.log(`   ${totalReceivedFromBatches} ml (received) - ${totalUsed} ml (used) = ${correctStock} ml\n`);

  console.log(`🔍 WHAT THE USER SEES:`);
  console.log(`   Atsargos tab: 572 ml ← WRONG (filtering out negative batches incorrectly)`);
  console.log(`   Usage analysis: 548 ml ← CORRECT\n`);

  console.log(`❌ THE PROBLEM:`);
  console.log(`   Batch 435332ALV: 20 ml received, 44 ml used = -24 ml`);
  console.log(`   This batch is filtered out (on_hand < 0) so it doesn't show in Inventory`);
  console.log(`   BUT its 20 ml received is still missing from the total!`);
  console.log(`   572 ml + 20 ml - 44 ml = 548 ml ← Correct!`);

  // Check how the Inventory component calculates (only positive on_hand batches)
  let inventoryTotal = 0;
  console.log(`\n📊 INVENTORY TAB LOGIC (only shows batches with positive stock):`);

  for (const batch of batches || []) {
    const { data: usage } = await supabase
      .from('usage_items')
      .select('qty')
      .eq('batch_id', batch.id);

    const used = usage?.reduce((sum, u) => sum + Number(u.qty), 0) || 0;
    const onHand = (batch.received_qty || 0) - used;

    if (onHand > 0) {
      console.log(`   ✅ ${batch.lot}: ${batch.received_qty} - ${used} = ${onHand} ml`);
      inventoryTotal += onHand;
    } else {
      console.log(`   ❌ ${batch.lot}: ${batch.received_qty} - ${used} = ${onHand} ml (HIDDEN)`);
    }
  }

  console.log(`   Total shown: ${inventoryTotal} ml`);
  console.log(`\n💡 SOLUTION:`);
  console.log(`   The Inventory component should NOT filter out negative batches`);
  console.log(`   OR it should show a warning when a batch has negative stock`);
  console.log(`   OR it should not allow more usage than received in a batch`);
}

verifyCorrectStock().catch(console.error);
