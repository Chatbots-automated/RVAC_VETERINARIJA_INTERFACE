import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function checkPlannedMeds() {
  console.log('🔍 Checking planned_medications JSON structure...\n');

  // Get one of the empty treatments
  const { data: treatment } = await supabase
    .from('treatments')
    .select('*, animals(tag_no)')
    .eq('reg_date', '2025-12-27')
    .not('visit_id', 'is', null)
    .limit(1)
    .single();

  if (!treatment) {
    console.log('No treatment found');
    return;
  }

  console.log(`Treatment for: ${treatment.animals?.tag_no}`);
  console.log(`visit_id: ${treatment.visit_id}\n`);

  // Get the visit
  const { data: visit } = await supabase
    .from('animal_visits')
    .select('*')
    .eq('id', treatment.visit_id)
    .single();

  if (!visit) {
    console.log('Visit not found');
    return;
  }

  console.log('planned_medications JSON:');
  console.log(JSON.stringify(visit.planned_medications, null, 2));

  if (Array.isArray(visit.planned_medications)) {
    console.log(`\n📦 Found ${visit.planned_medications.length} medications in array:\n`);
    visit.planned_medications.forEach((med, idx) => {
      console.log(`  Medication ${idx + 1}:`);
      console.log(`    - Product ID: ${med.product_id || med.productId || 'missing'}`);
      console.log(`    - Batch ID: ${med.batch_id || med.batchId || 'missing'}`);
      console.log(`    - Quantity: ${med.quantity || med.qty || 'missing'}`);
      console.log(`    - Unit: ${med.unit || 'missing'}`);
      console.log(`    - Days: ${med.days || 'missing'}`);
      console.log(`    - All keys: ${Object.keys(med).join(', ')}`);
      console.log('');
    });
  }

  // Get products to show names
  if (Array.isArray(visit.planned_medications) && visit.planned_medications.length > 0) {
    console.log('\n🔍 Looking up product names:\n');
    for (const med of visit.planned_medications) {
      const productId = med.product_id || med.productId;
      if (productId) {
        const { data: product } = await supabase
          .from('products')
          .select('name')
          .eq('id', productId)
          .single();

        console.log(`  - ${product?.name || 'Unknown'}: ${med.quantity || med.qty} ${med.unit}`);
      }
    }
  }
}

checkPlannedMeds().catch(console.error);
