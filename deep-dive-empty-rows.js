import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function deepDive() {
  console.log('🔬 Deep dive into "empty" treatments...\n');

  // Get treatments from Dec 27 that show as empty
  const { data: viewData } = await supabase
    .from('vw_treated_animals')
    .select('*')
    .eq('registration_date', '2025-12-27')
    .is('products_used', null)
    .limit(5);

  console.log(`Found ${viewData?.length || 0} treatments showing as empty\n`);

  for (const row of viewData || []) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Treatment: ${row.animal_tag}`);
    console.log(`Date: ${row.registration_date}`);
    console.log(`View shows:`);
    console.log(`  - products_used: ${row.products_used || 'NULL'}`);
    console.log(`  - dose_summary: ${row.dose_summary || 'NULL'}`);
    console.log(`  - veterinarian: ${row.veterinarian || 'NULL'}`);
    console.log(`  - treatment_days: ${row.treatment_days || 'NULL'}`);

    // Check actual treatment record
    const { data: treatment } = await supabase
      .from('treatments')
      .select('*')
      .eq('id', row.treatment_id)
      .single();

    console.log(`\nActual treatment record:`);
    console.log(`  - vet_name: ${treatment?.vet_name || 'NULL'}`);
    console.log(`  - reg_date: ${treatment?.reg_date}`);
    console.log(`  - disease_id: ${treatment?.disease_id || 'NULL'}`);

    // Check treatment_courses
    const { data: courses } = await supabase
      .from('treatment_courses')
      .select('*, products(name)')
      .eq('treatment_id', row.treatment_id);

    console.log(`\nTreatment courses: ${courses?.length || 0}`);
    if (courses && courses.length > 0) {
      courses.forEach(c => {
        console.log(`  - ${c.products?.name}: ${c.total_dose} ${c.unit} over ${c.days} days`);
      });
    }

    // Check usage_items
    const { data: usageItems } = await supabase
      .from('usage_items')
      .select('*, products(name)')
      .eq('treatment_id', row.treatment_id);

    console.log(`\nUsage items: ${usageItems?.length || 0}`);
    if (usageItems && usageItems.length > 0) {
      usageItems.forEach(ui => {
        console.log(`  - ${ui.products?.name}: ${ui.qty} ${ui.unit}`);
      });
    }

    // Check if linked to animal_visit
    if (treatment?.visit_id) {
      const { data: animalVisit } = await supabase
        .from('animal_visits')
        .select('*')
        .eq('id', treatment.visit_id)
        .single();

      console.log(`\nLinked animal_visit: ${animalVisit ? 'YES' : 'NO'}`);
      if (animalVisit) {
        console.log(`  - planned_medications: ${animalVisit.planned_medications || 'none'}`);
        console.log(`  - procedures: ${animalVisit.procedures || 'none'}`);
      }
    }
  }

  console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('💡 DIAGNOSIS:');
  console.log('If both usage_items and treatment_courses are empty,');
  console.log('then NO medications were recorded for these treatments!\n');
}

deepDive().catch(console.error);
