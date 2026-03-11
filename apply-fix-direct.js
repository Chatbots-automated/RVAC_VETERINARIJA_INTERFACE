import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function applyFix() {
  console.log('=== Fixing Withdrawal Calculation Bug ===\n');

  // Step 1: Find treatments with problematic courses
  console.log('Step 1: Identifying problematic treatments...\n');

  const { data: treatments } = await supabase
    .from('treatments')
    .select('id, reg_date');

  const problematicTreatmentIds = [];

  for (const treatment of treatments) {
    const { data: usageItems } = await supabase
      .from('usage_items')
      .select('product_id, products!inner(category)')
      .eq('treatment_id', treatment.id)
      .eq('products.category', 'medicines');

    if (!usageItems || usageItems.length === 0) continue;

    const { data: courses } = await supabase
      .from('treatment_courses')
      .select('product_id')
      .eq('treatment_id', treatment.id);

    // If ALL meds have courses, it's problematic
    if (courses && courses.length === usageItems.length && usageItems.length > 0) {
      problematicTreatmentIds.push(treatment.id);
    }
  }

  console.log(`Found ${problematicTreatmentIds.length} problematic treatments\n`);

  if (problematicTreatmentIds.length === 0) {
    console.log('No problematic treatments found. Exiting.');
    return;
  }

  // Step 2: Delete courses
  console.log('Step 2: Deleting auto-created courses...');

  const { error: deleteError } = await supabase
    .from('treatment_courses')
    .delete()
    .in('treatment_id', problematicTreatmentIds);

  if (deleteError) {
    console.error('Error deleting courses:', deleteError);
    return;
  }

  console.log(`✓ Deleted courses from ${problematicTreatmentIds.length} treatments\n`);

  // Step 3: Recalculate withdrawal dates
  console.log('Step 3: Recalculating withdrawal dates...\n');

  let recalculated = 0;
  let errors = 0;

  for (const treatmentId of problematicTreatmentIds) {
    const { error } = await supabase.rpc('calculate_withdrawal_dates', {
      p_treatment_id: treatmentId
    });

    if (error) {
      errors++;
    } else {
      recalculated++;
    }

    if (recalculated % 10 === 0) {
      process.stdout.write(`\rProcessed: ${recalculated}/${problematicTreatmentIds.length}`);
    }
  }

  console.log(`\n✓ Recalculated ${recalculated} treatments (${errors} errors)\n`);

  // Step 4: Verify the fix
  console.log('=== Verification ===\n');
  console.log('Checking cow LT000008564406...\n');

  const { data: treatment } = await supabase
    .from('treatments')
    .select('id, reg_date, withdrawal_until_milk, withdrawal_until_meat')
    .eq('animal_id', '051cb782-120c-451d-ae23-b6f23812e9c3')
    .eq('reg_date', '2025-11-26')
    .single();

  if (treatment) {
    const { data: courses } = await supabase
      .from('treatment_courses')
      .select('*')
      .eq('treatment_id', treatment.id);

    const { data: meds } = await supabase
      .from('usage_items')
      .select('*, products(name, withdrawal_days_milk, withdrawal_days_meat)')
      .eq('treatment_id', treatment.id);

    console.log('Treatment date: 2025-11-26');
    console.log(`Milk withdrawal: ${treatment.withdrawal_until_milk}`);
    console.log(`Courses: ${courses?.length || 0}`);
    console.log('\nMedications:');
    if (meds) {
      meds.forEach(m => {
        console.log(`  - ${m.products.name}: ${m.products.withdrawal_days_milk}d milk / ${m.products.withdrawal_days_meat}d meat`);
      });

      const maxMilk = Math.max(...meds.map(m => m.products.withdrawal_days_milk || 0));
      const expectedDate = new Date('2025-11-26');
      expectedDate.setDate(expectedDate.getDate() + maxMilk + 1);

      console.log(`\nExpected withdrawal: ${expectedDate.toISOString().split('T')[0]}`);
      console.log(`Actual withdrawal: ${treatment.withdrawal_until_milk}`);
      console.log(`Status: ${treatment.withdrawal_until_milk === expectedDate.toISOString().split('T')[0] ? '✓ CORRECT!' : '✗ Still wrong'}`);
    }
  }
}

applyFix().catch(console.error);
