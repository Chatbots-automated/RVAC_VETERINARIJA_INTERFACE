import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function investigate() {
  const animalTag = 'LT000008564406';

  console.log('=== Investigating Missing Treatments in Milk Loss ===\n');

  // 1. Get animal ID first
  const { data: animals, error: animalError } = await supabase
    .from('animals')
    .select('id')
    .eq('tag_no', animalTag)
    .single();

  if (animalError || !animals) {
    console.error('Error fetching animal:', animalError);
    return;
  }

  const animalId = animals.id;
  console.log(`Animal ID: ${animalId}\n`);

  // 2. Get all treatments for this animal
  const { data: treatments, error: treatmentsError } = await supabase
    .from('treatments')
    .select('*')
    .eq('animal_id', animalId)
    .order('reg_date', { ascending: false });

  if (treatmentsError) {
    console.error('Error fetching treatments:', treatmentsError);
    return;
  }

  console.log(`Total treatments: ${treatments.length}`);
  console.log('Treatment dates:', treatments.map(t => t.reg_date).join(', '));
  console.log('\n');

  // 3. Get milk loss summary for this animal
  const { data: milkLoss, error: milkLossError } = await supabase
    .from('treatment_milk_loss_summary')
    .select('*')
    .eq('animal_tag', animalTag)
    .order('treatment_date', { ascending: false });

  if (milkLossError) {
    console.error('Error fetching milk loss:', milkLossError);
    return;
  }

  console.log(`Treatments in milk loss view: ${milkLoss.length}`);
  console.log('Milk loss treatment dates:', milkLoss.map(m => m.treatment_date).join(', '));
  console.log('\n');

  // 4. Compare which treatments are missing
  console.log('=== MISSING TREATMENTS ===');
  const milkLossDates = new Set(milkLoss.map(m => m.treatment_date));
  const missingTreatments = treatments.filter(t => !milkLossDates.has(t.reg_date));

  console.log(`Missing ${missingTreatments.length} treatments from milk loss view:\n`);

  for (const treatment of missingTreatments) {
    console.log(`Date: ${treatment.reg_date}`);
    console.log(`  Disease ID: ${treatment.disease_id || 'N/A'}`);
    console.log(`  Notes: ${treatment.notes || 'N/A'}`);
    console.log(`  Visit ID: ${treatment.visit_id || 'N/A'}`);
    console.log(`  Vet: ${treatment.vet_name || 'N/A'}`);

    // Check if this treatment has medications
    const { data: meds } = await supabase
      .from('treatment_medications')
      .select('*')
      .eq('treatment_id', treatment.id);

    console.log(`  Medications: ${meds?.length || 0}`);
    if (meds && meds.length > 0) {
      for (const med of meds) {
        console.log(`    - ${med.product_name}: ${med.dose_given} ${med.unit}`);
      }
    }
    console.log('');
  }

  // 5. Check the view definition to understand the filtering
  console.log('\n=== CHECKING VIEW LOGIC ===');
  console.log('The treatment_milk_loss_summary view might be filtering out treatments that:');
  console.log('  - Have no medications with milk withdrawal periods');
  console.log('  - Have medications with 0 days milk withdrawal');
  console.log('  - Missing milk production data');
  console.log('\nLet me check each missing treatment...\n');

  for (const treatment of missingTreatments) {
    console.log(`Treatment ${treatment.reg_date}:`);

    const { data: meds } = await supabase
      .from('treatment_medications')
      .select(`
        *,
        products (
          name,
          milk_withdrawal_days,
          meat_withdrawal_days
        )
      `)
      .eq('treatment_id', treatment.id);

    if (!meds || meds.length === 0) {
      console.log('  ❌ NO MEDICATIONS - This is why it is missing!');
    } else {
      console.log(`  Medications with withdrawal:`);
      for (const med of meds) {
        const milkDays = med.products?.milk_withdrawal_days || 0;
        const meatDays = med.products?.meat_withdrawal_days || 0;
        console.log(`    - ${med.products?.name}: ${milkDays}d milk / ${meatDays}d meat`);
        if (milkDays === 0) {
          console.log('      ⚠️ Zero milk withdrawal - might be excluded');
        }
      }
    }
    console.log('');
  }
}

investigate().catch(console.error);
