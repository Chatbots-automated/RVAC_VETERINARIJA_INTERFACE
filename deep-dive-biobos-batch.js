import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function investigateBatch() {
  console.log('🔍 Deep dive into BioBos Respi 4 Batch 705232BLV...\n');

  // Get the problematic batch
  const { data: batches } = await supabase
    .from('batches')
    .select('*, products(name, primary_pack_unit)')
    .eq('lot', '705232BLV');

  if (!batches || batches.length === 0) {
    console.log('❌ Batch not found');
    return;
  }

  const batch = batches[0];
  console.log('📦 BATCH DETAILS:');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Product: ${batch.products.name}`);
  console.log(`Batch ID: ${batch.id}`);
  console.log(`LOT: ${batch.lot}`);
  console.log(`Created: ${batch.created_at}`);
  console.log(`Received Qty: ${batch.received_qty} ml`);
  console.log(`Qty Left: ${batch.qty_left} ml`);
  console.log(`Package Size: ${batch.package_size}`);
  console.log(`Package Count: ${batch.package_count}`);
  console.log(`Status: ${batch.status}`);

  // Check if received_qty was calculated from package_size * package_count
  if (batch.package_size && batch.package_count) {
    const calculatedReceived = batch.package_size * batch.package_count;
    console.log(`\nCalculated from packages: ${batch.package_size} × ${batch.package_count} = ${calculatedReceived} ml`);
    if (Math.abs(calculatedReceived - batch.received_qty) > 0.01) {
      console.log(`⚠️  MISMATCH! received_qty (${batch.received_qty}) != calculated (${calculatedReceived})`);
    }
  }

  // Get ALL usage_items for this batch
  const { data: usageItems } = await supabase
    .from('usage_items')
    .select('id, qty, created_at, vaccination_id, treatment_id, purpose')
    .eq('batch_id', batch.id)
    .order('created_at', { ascending: true });

  console.log('\n\n📊 USAGE ITEMS (chronological):');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Total usage_items: ${usageItems?.length || 0}\n`);

  let runningTotal = batch.received_qty;
  let totalDeducted = 0;

  if (usageItems && usageItems.length > 0) {
    console.log('Date       | Qty   | Running Total | Vacc ID | Purpose');
    console.log('─'.repeat(70));
    
    usageItems.forEach((item, idx) => {
      runningTotal -= item.qty;
      totalDeducted += item.qty;
      const vaccId = item.vaccination_id ? item.vaccination_id.substring(0, 8) : 'N/A';
      
      if (idx < 20 || runningTotal < 0) { // Show first 20 and any that cause negative
        console.log(
          `${item.created_at.substring(0, 10)} | ${item.qty.toString().padStart(5)} | ${runningTotal.toFixed(2).padStart(13)}${runningTotal < 0 ? ' ⚠️' : '   '} | ${vaccId} | ${item.purpose || 'N/A'}`
        );
      }
    });

    if (usageItems.length > 20) {
      console.log(`... (${usageItems.length - 20} more items)`);
    }

    console.log('─'.repeat(70));
    console.log(`TOTAL DEDUCTED: ${totalDeducted} ml`);
    console.log(`FINAL QTY_LEFT: ${runningTotal.toFixed(2)} ml`);
    console.log(`DATABASE qty_left: ${batch.qty_left} ml`);
    console.log(`MATCH: ${Math.abs(runningTotal - batch.qty_left) < 0.01 ? '✅ YES' : '❌ NO'}`);
  }

  // Get ALL vaccinations for this batch
  const { data: vaccinations } = await supabase
    .from('vaccinations')
    .select('id, dose_amount, vaccination_date, animal_id, animals(tag_no)')
    .eq('batch_id', batch.id)
    .order('vaccination_date', { ascending: true });

  console.log('\n\n💉 VACCINATIONS (chronological):');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Total vaccinations: ${vaccinations?.length || 0}\n`);

  if (vaccinations && vaccinations.length > 0) {
    let totalVaccDoses = 0;
    
    console.log('Date       | Dose  | Animal | Vacc ID');
    console.log('─'.repeat(60));
    
    vaccinations.forEach((vacc, idx) => {
      totalVaccDoses += vacc.dose_amount;
      
      if (idx < 20) {
        console.log(
          `${vacc.vaccination_date} | ${vacc.dose_amount.toString().padStart(5)} | ${(vacc.animals?.tag_no || 'N/A').padEnd(6)} | ${vacc.id.substring(0, 8)}`
        );
      }
    });

    if (vaccinations.length > 20) {
      console.log(`... (${vaccinations.length - 20} more vaccinations)`);
    }

    console.log('─'.repeat(60));
    console.log(`TOTAL VACCINATION DOSES: ${totalVaccDoses} ml`);
  }

  // Check if vaccinations have corresponding usage_items
  console.log('\n\n🔗 VACCINATION → USAGE_ITEM LINK CHECK:');
  console.log('═══════════════════════════════════════════════════════════════');

  if (vaccinations && usageItems) {
    let linkedCount = 0;
    let unlinkedVaccinations = [];

    for (const vacc of vaccinations) {
      const hasUsageItem = usageItems.some(u => u.vaccination_id === vacc.id);
      if (hasUsageItem) {
        linkedCount++;
      } else {
        unlinkedVaccinations.push(vacc);
      }
    }

    console.log(`✅ Vaccinations with usage_item: ${linkedCount}`);
    console.log(`❌ Vaccinations WITHOUT usage_item: ${unlinkedVaccinations.length}`);

    if (unlinkedVaccinations.length > 0) {
      console.log('\n⚠️  Unlinked vaccinations (first 5):');
      unlinkedVaccinations.slice(0, 5).forEach(v => {
        console.log(`   ${v.vaccination_date} | ${v.dose_amount} ml | Animal: ${v.animals?.tag_no || 'N/A'}`);
      });
    }
  }

  console.log('\n\n🎯 DIAGNOSIS:');
  console.log('═══════════════════════════════════════════════════════════════');
  
  if (batch.qty_left < 0) {
    console.log('❌ ISSUE CONFIRMED: qty_left is negative in database');
    console.log(`\nThis batch received ${batch.received_qty} ml but had ${totalDeducted} ml deducted.`);
    console.log(`Overdraft: ${totalDeducted - batch.received_qty} ml`);
    
    console.log('\n🔍 POSSIBLE CAUSES:');
    console.log('1. ❌ CHECK constraint missing - allowed qty_left to go negative');
    console.log('2. ❌ Stock check function was not working when these vaccinations were created');
    console.log('3. ⚠️  Batch was created with wrong received_qty (too low)');
    console.log('4. ⚠️  Usage was recorded before batch was created (timestamp mismatch)');
    
    // Check if usage happened before batch creation
    if (usageItems && usageItems.length > 0) {
      const batchCreated = new Date(batch.created_at);
      const firstUsage = new Date(usageItems[0].created_at);
      
      console.log(`\n📅 TIMELINE CHECK:`);
      console.log(`   Batch created: ${batch.created_at}`);
      console.log(`   First usage: ${usageItems[0].created_at}`);
      
      if (firstUsage < batchCreated) {
        console.log(`   ❌ PROBLEM: Usage happened BEFORE batch was created!`);
      } else {
        console.log(`   ✅ Timeline is correct`);
      }
    }
  }
}

investigateBatch().catch(console.error);
