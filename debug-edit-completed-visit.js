import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function debugEditFlow() {
  console.log('🔍 Debugging Edit Completed Visit Flow\n');

  // Find a completed visit with treatment
  console.log('1. Finding completed visits with treatments...');
  const { data: visits } = await supabase
    .from('animal_visits')
    .select(`
      id,
      animal_id,
      status,
      visit_datetime,
      procedures,
      planned_medications,
      medications_processed
    `)
    .eq('status', 'Baigtas')
    .contains('procedures', ['Gydymas'])
    .limit(5);

  if (!visits || visits.length === 0) {
    console.log('❌ No completed visits with treatments found');
    return;
  }

  console.log(`✅ Found ${visits.length} completed visits\n`);

  for (const visit of visits.slice(0, 2)) {
    console.log(`\n📋 Visit ID: ${visit.id}`);
    console.log(`   Status: ${visit.status}`);
    console.log(`   Visit Date: ${visit.visit_datetime}`);
    console.log(`   Procedures: ${visit.procedures.join(', ')}`);
    console.log(`   Medications Processed: ${visit.medications_processed}`);
    console.log(`   Planned Medications: ${visit.planned_medications ? 'Yes' : 'No'}`);

    // Get treatment for this visit
    const { data: treatments } = await supabase
      .from('treatments')
      .select('id')
      .eq('visit_id', visit.id);

    if (treatments && treatments.length > 0) {
      console.log(`   Treatment ID: ${treatments[0].id}`);

      // Get usage_items for this treatment
      const { data: usageItems } = await supabase
        .from('usage_items')
        .select('product_id, batch_id, qty, unit')
        .eq('treatment_id', treatments[0].id);

      console.log(`   Usage Items: ${usageItems?.length || 0}`);
      if (usageItems && usageItems.length > 0) {
        usageItems.forEach((item, idx) => {
          console.log(`     ${idx + 1}. Product: ${item.product_id}, Batch: ${item.batch_id}, Qty: ${item.qty} ${item.unit}`);
        });
      }
    }
  }

  console.log('\n\n🔧 Testing Edit Scenario...\n');

  // Find the first completed visit to test with
  const testVisit = visits[0];
  console.log(`Using visit ${testVisit.id} for testing`);

  // Get current treatment
  const { data: treatment } = await supabase
    .from('treatments')
    .select('id')
    .eq('visit_id', testVisit.id)
    .maybeSingle();

  if (!treatment) {
    console.log('❌ No treatment found for test visit');
    return;
  }

  console.log(`Treatment ID: ${treatment.id}`);

  // Count current usage_items
  const { data: currentUsage, count: beforeCount } = await supabase
    .from('usage_items')
    .select('*', { count: 'exact' })
    .eq('treatment_id', treatment.id);

  console.log(`Current usage_items count: ${beforeCount}`);

  console.log('\n📝 Analysis:');
  console.log('When editing a completed visit:');
  console.log('1. VisitCreateModal.handleSubmit() is called');
  console.log('2. Line 2510: ALL usage_items for treatment are deleted');
  console.log('3. Line 2576-2635: Medications are looped through');
  console.log('4. Line 2619: If status === "Baigtas", create usage_items');
  console.log('\nThe logic SHOULD work IF:');
  console.log('  - formData.status remains as "Baigtas"');
  console.log('  - The medications array has items');
  console.log('  - autoComplete is not preventing the check');

  console.log('\n⚠️  Potential Issues:');
  console.log('1. If user accidentally changes status dropdown from "Baigtas" to something else');
  console.log('2. If formData.status is not preserved correctly when loading visitToEdit');
  console.log('3. If there\'s a timing issue with the database trigger');

  console.log('\n💡 Solution:');
  console.log('Add explicit logging or validation in the frontend to ensure:');
  console.log('  - Status is preserved as "Baigtas" when editing completed visits');
  console.log('  - Usage items are created even when editing');
  console.log('  - Or add a confirmation dialog showing what will be deducted');
}

debugEditFlow();
