import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function diagnoseReportGaps() {
  console.log('🔬 Diagnosing treated animals report gaps...\n');

  // Query the view to see what's coming back
  const { data: viewData, error: viewError } = await supabase
    .from('vw_treated_animals')
    .select('*')
    .eq('registration_date', '2025-12-27')
    .order('animal_tag');

  if (viewError) {
    console.log('❌ Error querying view:', viewError);
    return;
  }

  console.log(`Found ${viewData?.length || 0} treatments on 2025-12-27\n`);

  for (const row of viewData || []) {
    console.log(`\n📋 Treatment ID: ${row.treatment_id?.substring(0, 8)}`);
    console.log(`   Animal: ${row.animal_tag || 'N/A'}`);
    console.log(`   Disease: ${row.disease_name || 'N/A'}`);
    console.log(`   Vet: ${row.veterinarian || 'N/A'}`);
    console.log(`   Products Used: ${row.products_used || '❌ EMPTY'}`);
    console.log(`   Dose Summary: ${row.dose_summary || '❌ EMPTY'}`);

    // Now check what's actually in the database for this treatment
    const { data: usageItems } = await supabase
      .from('usage_items')
      .select('*, products(name)')
      .eq('treatment_id', row.treatment_id);

    const { data: courses } = await supabase
      .from('treatment_courses')
      .select('*, products(name)')
      .eq('treatment_id', row.treatment_id);

    console.log(`\n   📦 Actual Data:`);
    console.log(`      Usage items: ${usageItems?.length || 0}`);
    if (usageItems && usageItems.length > 0) {
      usageItems.forEach(item => {
        console.log(`         - ${item.products?.name}: ${item.qty} ${item.unit}`);
      });
    }

    console.log(`      Treatment courses: ${courses?.length || 0}`);
    if (courses && courses.length > 0) {
      courses.forEach(course => {
        console.log(`         - ${course.products?.name}: ${course.total_dose} ${course.unit} over ${course.days} days`);
      });
    }

    if ((!usageItems || usageItems.length === 0) && (!courses || courses.length === 0)) {
      console.log(`      ⚠️  NO MEDICATIONS RECORDED FOR THIS TREATMENT!`);
    }
  }

  // Now check if there are treatments with medications that ARE showing correctly
  console.log(`\n\n✅ Checking treatments WITH medications...\n`);

  const { data: withMeds } = await supabase
    .from('vw_treated_animals')
    .select('treatment_id, animal_tag, products_used, dose_summary')
    .not('products_used', 'is', null)
    .limit(5);

  console.log(`Found ${withMeds?.length || 0} treatments with products_used:\n`);

  for (const row of withMeds || []) {
    console.log(`   ${row.animal_tag}: ${row.products_used}`);
    console.log(`      Doses: ${row.dose_summary || 'N/A'}`);

    // Check what they have
    const { data: usageItems } = await supabase
      .from('usage_items')
      .select('qty, unit, products(name)')
      .eq('treatment_id', row.treatment_id);

    if (usageItems && usageItems.length > 0) {
      console.log(`      Usage items: ${usageItems.map(u => `${u.qty} ${u.unit} ${u.products?.name}`).join(', ')}`);
    }
  }
}

diagnoseReportGaps().catch(console.error);
