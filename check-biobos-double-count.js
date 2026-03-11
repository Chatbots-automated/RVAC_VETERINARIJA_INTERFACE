import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function checkDoubleCount() {
  console.log('🔍 Checking for double-counting in BioBos Respi 4...\n');

  // Get the product
  const { data: products } = await supabase
    .from('products')
    .select('*')
    .eq('name', 'BioBos Respi 4 inj.susp. 10 ml');

  if (!products || products.length === 0) {
    console.log('❌ Product not found');
    return;
  }

  const product = products[0];
  console.log('✅ Product:', product.name, '\n');

  // Get all vaccinations for this product
  const { data: vaccinations } = await supabase
    .from('vaccinations')
    .select('id, dose_amount, vaccination_date, batch_id, animal_id')
    .eq('product_id', product.id)
    .order('vaccination_date', { ascending: false });

  console.log(`💉 Total Vaccinations: ${vaccinations?.length || 0}`);
  
  if (vaccinations && vaccinations.length > 0) {
    console.log(`   First 5:`);
    vaccinations.slice(0, 5).forEach((v, idx) => {
      console.log(`   ${idx + 1}. Date: ${v.vaccination_date} | Dose: ${v.dose_amount} ml | Batch: ${v.batch_id?.substring(0, 8)}`);
    });
  }

  // Get all usage_items for this product
  const { data: usageItems } = await supabase
    .from('usage_items')
    .select('id, qty, created_at, batch_id, vaccination_id')
    .eq('product_id', product.id)
    .order('created_at', { ascending: false });

  console.log(`\n📦 Total Usage Items: ${usageItems?.length || 0}`);
  
  if (usageItems && usageItems.length > 0) {
    console.log(`   First 5:`);
    usageItems.slice(0, 5).forEach((u, idx) => {
      console.log(`   ${idx + 1}. Date: ${u.created_at?.substring(0, 10)} | Qty: ${u.qty} ml | Batch: ${u.batch_id?.substring(0, 8)} | Vacc ID: ${u.vaccination_id?.substring(0, 8) || 'NULL'}`);
    });
  }

  // Check how many usage_items have vaccination_id
  const usageItemsWithVaccId = usageItems?.filter(u => u.vaccination_id) || [];
  const usageItemsWithoutVaccId = usageItems?.filter(u => !u.vaccination_id) || [];

  console.log(`\n📊 BREAKDOWN:`);
  console.log(`   Usage items WITH vaccination_id: ${usageItemsWithVaccId.length}`);
  console.log(`   Usage items WITHOUT vaccination_id: ${usageItemsWithoutVaccId.length}`);

  // Check if every vaccination has a corresponding usage_item
  let vaccinationsWithUsageItem = 0;
  let vaccinationsWithoutUsageItem = 0;

  if (vaccinations) {
    for (const vacc of vaccinations) {
      const hasUsageItem = usageItems?.some(u => u.vaccination_id === vacc.id);
      if (hasUsageItem) {
        vaccinationsWithUsageItem++;
      } else {
        vaccinationsWithoutUsageItem++;
      }
    }
  }

  console.log(`\n💉 VACCINATION ANALYSIS:`);
  console.log(`   Vaccinations WITH usage_item: ${vaccinationsWithUsageItem}`);
  console.log(`   Vaccinations WITHOUT usage_item: ${vaccinationsWithoutUsageItem}`);

  console.log(`\n\n🔍 DOUBLE-COUNTING CHECK:`);
  console.log('═══════════════════════════════════════════════════════════════');
  
  const totalVaccinationDoses = vaccinations?.reduce((sum, v) => sum + (v.dose_amount || 0), 0) || 0;
  const totalUsageItemQty = usageItems?.reduce((sum, u) => sum + (u.qty || 0), 0) || 0;

  console.log(`Total from vaccinations table: ${totalVaccinationDoses} ml`);
  console.log(`Total from usage_items table: ${totalUsageItemQty} ml`);
  
  if (Math.abs(totalVaccinationDoses - totalUsageItemQty) < 0.01) {
    console.log(`\n✅ NO DOUBLE-COUNTING: Amounts match perfectly!`);
    console.log(`   This means vaccinations are correctly converted to usage_items.`);
  } else if (totalUsageItemQty > totalVaccinationDoses) {
    console.log(`\n⚠️  POSSIBLE ISSUE: usage_items has MORE than vaccinations`);
    console.log(`   Difference: ${totalUsageItemQty - totalVaccinationDoses} ml`);
    console.log(`   This could mean there are non-vaccination usage_items too.`);
  } else {
    console.log(`\n❌ DOUBLE-COUNTING DETECTED!`);
    console.log(`   If both are counted, total would be: ${totalVaccinationDoses + totalUsageItemQty} ml`);
    console.log(`   But actual stock deduction is: ${totalUsageItemQty} ml (from usage_items)`);
  }

  // Check batches
  console.log(`\n\n📦 BATCH STOCK STATUS:`);
  console.log('═══════════════════════════════════════════════════════════════');
  
  const { data: batches } = await supabase
    .from('batches')
    .select('id, lot, received_qty, qty_left')
    .eq('product_id', product.id)
    .order('created_at', { ascending: false });

  let totalReceived = 0;
  let totalQtyLeft = 0;

  batches?.forEach((batch, idx) => {
    const used = batch.received_qty - (batch.qty_left || 0);
    console.log(`\nBatch ${idx + 1} (${batch.lot}):`);
    console.log(`  Received: ${batch.received_qty} ml`);
    console.log(`  Qty Left: ${batch.qty_left} ml${batch.qty_left < 0 ? ' ⚠️ NEGATIVE!' : ''}`);
    console.log(`  Used: ${used} ml`);
    
    totalReceived += batch.received_qty;
    totalQtyLeft += (batch.qty_left || 0);
  });

  console.log(`\n${'─'.repeat(65)}`);
  console.log(`TOTAL: Received=${totalReceived} ml, Qty Left=${totalQtyLeft} ml, Used=${totalReceived - totalQtyLeft} ml`);

  console.log(`\n\n🎯 CONCLUSION:`);
  console.log('═══════════════════════════════════════════════════════════════');
  
  if (totalQtyLeft < 0) {
    console.log(`❌ PROBLEM: Total qty_left is NEGATIVE (${totalQtyLeft} ml)`);
    console.log(`   This means more stock was deducted than received.`);
    console.log(`\n   Root cause: The database allowed qty_left to go negative.`);
    console.log(`   This happened because there's no CHECK constraint on batches.qty_left`);
    console.log(`   (unlike equipment_batches which has: CHECK (qty_left >= 0))`);
    console.log(`\n   The trigger deducted stock correctly, but didn't stop at 0.`);
  } else {
    console.log(`✅ Stock levels look correct!`);
  }
}

checkDoubleCount().catch(console.error);
