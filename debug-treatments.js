import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function debugTreatments() {
  console.log('🔬 Debugging treatments access...\n');

  // Try basic count
  const { count, error: countError } = await supabase
    .from('treatments')
    .select('*', { count: 'exact', head: true });

  console.log(`Total treatments: ${count || 0}`);
  if (countError) console.log('Count error:', countError);

  // Try simple select
  const { data: treatments, error: selectError } = await supabase
    .from('treatments')
    .select('id, amount, treatment_date')
    .limit(10);

  console.log(`\nSelect returned: ${treatments?.length || 0} treatments`);
  if (selectError) {
    console.log('Select error:', selectError);
  } else if (treatments) {
    console.log('\nSample treatments:');
    treatments.forEach(t => {
      console.log(`   ${t.id.substring(0, 8)}: ${t.amount} units on ${t.treatment_date}`);
    });
  }

  // Check usage_items
  console.log(`\n\n🔬 Checking usage_items...\n`);

  const { count: usageCount } = await supabase
    .from('usage_items')
    .select('*', { count: 'exact', head: true });

  console.log(`Total usage_items: ${usageCount || 0}`);

  // Check how many have treatment_id
  const { count: treatmentUsageCount } = await supabase
    .from('usage_items')
    .select('*', { count: 'exact', head: true })
    .not('treatment_id', 'is', null);

  console.log(`Usage_items with treatment_id: ${treatmentUsageCount || 0}`);

  // Check how many have vaccination_id
  const { count: vaccinationUsageCount } = await supabase
    .from('usage_items')
    .select('*', { count: 'exact', head: true })
    .not('vaccination_id', 'is', null);

  console.log(`Usage_items with vaccination_id: ${vaccinationUsageCount || 0}`);

  // Check how many have course_medication_id
  const { count: courseUsageCount } = await supabase
    .from('usage_items')
    .select('*', { count: 'exact', head: true })
    .not('course_medication_id', 'is', null);

  console.log(`Usage_items with course_medication_id: ${courseUsageCount || 0}`);

  // Get sample of each type
  console.log(`\n📊 SAMPLE USAGE_ITEMS BY TYPE:\n`);

  const { data: treatmentUsage } = await supabase
    .from('usage_items')
    .select('id, product_id, qty, batch_id, treatment_id, created_at')
    .not('treatment_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(5);

  console.log(`Treatment usage (${treatmentUsage?.length || 0}):`);
  for (const u of treatmentUsage || []) {
    console.log(`   ${u.qty} units, batch: ${u.batch_id ? 'YES' : 'NO'}, created: ${u.created_at?.substring(0, 10)}`);
  }

  const { data: vaccineUsage } = await supabase
    .from('usage_items')
    .select('id, product_id, qty, batch_id, vaccination_id, created_at')
    .not('vaccination_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(5);

  console.log(`\nVaccination usage (${vaccineUsage?.length || 0}):`);
  for (const u of vaccineUsage || []) {
    console.log(`   ${u.qty} units, batch: ${u.batch_id ? 'YES' : 'NO'}, created: ${u.created_at?.substring(0, 10)}`);
  }

  // Now match some treatments to usage_items
  console.log(`\n\n🔍 Matching treatments to usage_items...\n`);

  if (treatments && treatments.length > 0) {
    for (const treatment of treatments.slice(0, 5)) {
      const { data: usageForTreatment } = await supabase
        .from('usage_items')
        .select('qty, batch_id')
        .eq('treatment_id', treatment.id);

      console.log(`Treatment ${treatment.id.substring(0, 8)} (${treatment.amount} units):`);
      if (usageForTreatment && usageForTreatment.length > 0) {
        console.log(`   ✅ Has ${usageForTreatment.length} usage_items (${usageForTreatment[0].qty} units)`);
      } else {
        console.log(`   ❌ No usage_items found - STOCK NOT DEDUCTED!`);
      }
    }
  }
}

debugTreatments().catch(console.error);
