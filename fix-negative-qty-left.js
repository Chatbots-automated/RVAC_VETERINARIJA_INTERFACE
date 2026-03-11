import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function fixNegativeQtyLeft() {
  console.log('🔍 Finding batches with negative qty_left...\n');

  // Find all batches with negative qty_left
  const { data: negativeBatches, error } = await supabase
    .from('batches')
    .select('id, product_id, lot, received_qty, qty_left, products(name, primary_pack_unit)')
    .lt('qty_left', 0);

  if (error) {
    console.error('❌ Error:', error);
    return;
  }

  if (!negativeBatches || negativeBatches.length === 0) {
    console.log('✅ No batches with negative qty_left found!');
    return;
  }

  console.log(`⚠️  Found ${negativeBatches.length} batches with negative qty_left:\n`);

  negativeBatches.forEach((batch, idx) => {
    console.log(`${idx + 1}. ${batch.products.name}`);
    console.log(`   Batch ID: ${batch.id.substring(0, 8)}...`);
    console.log(`   LOT: ${batch.lot || 'N/A'}`);
    console.log(`   Received: ${batch.received_qty} ${batch.products.primary_pack_unit}`);
    console.log(`   Qty Left: ${batch.qty_left} ${batch.products.primary_pack_unit} ⚠️`);
    console.log(`   Overdraft: ${Math.abs(batch.qty_left)} ${batch.products.primary_pack_unit}`);
    console.log();
  });

  console.log('\n📊 SUMMARY:');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Total batches with negative stock: ${negativeBatches.length}`);
  console.log(`Total overdraft amount: ${negativeBatches.reduce((sum, b) => sum + Math.abs(b.qty_left), 0).toFixed(2)}`);

  console.log('\n\n🔧 FIXING OPTIONS:');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('\nOption 1: Set negative qty_left to 0 (recommended)');
  console.log('  - This acknowledges the overdraft happened');
  console.log('  - Sets remaining stock to 0 (depleted)');
  console.log('  - Preserves historical usage records');
  console.log('  - Command: node fix-negative-qty-left.js --fix-to-zero');

  console.log('\nOption 2: Adjust received_qty to match usage');
  console.log('  - Increases received_qty to cover the overdraft');
  console.log('  - Sets qty_left to 0');
  console.log('  - Makes historical records appear correct');
  console.log('  - Command: node fix-negative-qty-left.js --adjust-received');

  console.log('\nOption 3: Manual review');
  console.log('  - Review each batch individually');
  console.log('  - Decide on case-by-case basis');

  // Check if user wants to apply fix
  const fixMode = process.argv[2];

  if (fixMode === '--fix-to-zero') {
    console.log('\n\n🔧 APPLYING FIX: Setting negative qty_left to 0...\n');
    
    for (const batch of negativeBatches) {
      const { error: updateError } = await supabase
        .from('batches')
        .update({ 
          qty_left: 0,
          status: 'depleted'
        })
        .eq('id', batch.id);

      if (updateError) {
        console.error(`❌ Failed to update batch ${batch.id}:`, updateError);
      } else {
        console.log(`✅ Fixed: ${batch.products.name} (${batch.lot}) - set qty_left to 0`);
      }
    }

    console.log('\n✅ All negative qty_left values have been set to 0!');
    
  } else if (fixMode === '--adjust-received') {
    console.log('\n\n🔧 APPLYING FIX: Adjusting received_qty to match usage...\n');
    
    for (const batch of negativeBatches) {
      const actualUsed = batch.received_qty - batch.qty_left;
      const newReceivedQty = actualUsed; // Set received to match what was used
      
      const { error: updateError } = await supabase
        .from('batches')
        .update({ 
          received_qty: newReceivedQty,
          qty_left: 0,
          status: 'depleted'
        })
        .eq('id', batch.id);

      if (updateError) {
        console.error(`❌ Failed to update batch ${batch.id}:`, updateError);
      } else {
        console.log(`✅ Fixed: ${batch.products.name} (${batch.lot})`);
        console.log(`   Old: received=${batch.received_qty}, qty_left=${batch.qty_left}`);
        console.log(`   New: received=${newReceivedQty}, qty_left=0`);
      }
    }

    console.log('\n✅ All batches adjusted!');
  }
}

fixNegativeQtyLeft().catch(console.error);
