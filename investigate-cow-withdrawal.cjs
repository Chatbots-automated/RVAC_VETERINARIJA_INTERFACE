require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

(async () => {
  const cowTag = 'LT000008370321';

  // Find the cow
  const { data: cow, error: cowError } = await supabase
    .from('animals')
    .select('*')
    .eq('tag_no', cowTag)
    .maybeSingle();

  if (cowError || !cow) {
    console.log('Cow not found:', cowError?.message || 'No cow with this tag');
    return;
  }

  console.log('Found cow:', cow.id);
  console.log('Tag:', cow.tag_no);
  console.log('Species:', cow.species);
  console.log('Owner:', cow.holder_name);

  // Get recent treatments
  console.log('\n=== RECENT TREATMENTS ===');
  const { data: treatments, error: treatError } = await supabase
    .from('treatments')
    .select('id, reg_date, withdrawal_until_meat, withdrawal_until_milk, disease_id, diseases(name)')
    .eq('animal_id', cow.id)
    .order('reg_date', { ascending: false })
    .limit(10);

  if (treatError) {
    console.log('Error fetching treatments:', treatError.message);
    return;
  }

  console.log('Total treatments found:', treatments?.length || 0);

  if (!treatments || treatments.length === 0) {
    console.log('\nNo treatments found for this cow!');
    return;
  }

  treatments.forEach((t, idx) => {
    console.log(`\n[${idx + 1}] Treatment ID:`, t.id);
    console.log('    Date:', t.reg_date);
    console.log('    Disease:', t.diseases?.name || 'None');
    console.log('    Withdrawal meat:', t.withdrawal_until_meat || 'NONE');
    console.log('    Withdrawal milk:', t.withdrawal_until_milk || 'NONE');
  });

  // Get the most recent treatment details
  const recentTreatment = treatments[0];
  console.log('\n=== MOST RECENT TREATMENT ANALYSIS ===');
  console.log('Treatment ID:', recentTreatment.id);
  console.log('Date:', recentTreatment.reg_date);

  // Check usage_items
  const { data: usageItems } = await supabase
    .from('usage_items')
    .select('qty, unit, products(name, withdrawal_meat_days, withdrawal_milk_days)')
    .eq('treatment_id', recentTreatment.id);

  console.log('\nUsage items:', usageItems?.length || 0);
  if (usageItems && usageItems.length > 0) {
    usageItems.forEach(item => {
      console.log('  -', item.products?.name);
      console.log('    Qty:', item.qty, item.unit);
      console.log('    Withdrawal meat:', item.products?.withdrawal_meat_days || 0, 'days');
      console.log('    Withdrawal milk:', item.products?.withdrawal_milk_days || 0, 'days');
    });
  }

  // Check treatment_courses
  const { data: courses } = await supabase
    .from('treatment_courses')
    .select('days, products(name, withdrawal_meat_days, withdrawal_milk_days)')
    .eq('treatment_id', recentTreatment.id);

  console.log('\nTreatment courses:', courses?.length || 0);
  if (courses && courses.length > 0) {
    courses.forEach(course => {
      console.log('  -', course.products?.name, '- Duration:', course.days, 'days');
      console.log('    Withdrawal meat:', course.products?.withdrawal_meat_days || 0, 'days');
      console.log('    Withdrawal milk:', course.products?.withdrawal_milk_days || 0, 'days');
    });
  }

  // Check if there's a visit associated
  const { data: visit } = await supabase
    .from('animal_visits')
    .select('id, planned_medications')
    .eq('id', recentTreatment.id)
    .maybeSingle();

  if (visit?.planned_medications && visit.planned_medications.length > 0) {
    console.log('\nPlanned medications:', visit.planned_medications.length);
    for (const med of visit.planned_medications) {
      const { data: product } = await supabase
        .from('products')
        .select('name, withdrawal_meat_days, withdrawal_milk_days')
        .eq('id', med.product_id)
        .maybeSingle();

      if (product) {
        console.log('  -', product.name);
        console.log('    Withdrawal meat:', product.withdrawal_meat_days || 0, 'days');
        console.log('    Withdrawal milk:', product.withdrawal_milk_days || 0, 'days');
      }
    }
  }

  console.log('\n=== DIAGNOSIS ===');
  if (!recentTreatment.withdrawal_until_meat && !recentTreatment.withdrawal_until_milk) {
    console.log('❌ The treatment has NO withdrawal periods set!');

    const hasProducts = (usageItems && usageItems.length > 0) ||
                       (courses && courses.length > 0) ||
                       (visit?.planned_medications && visit.planned_medications.length > 0);

    if (!hasProducts) {
      console.log('\n❌ CAUSE: The treatment has NO medications recorded!');
      console.log('   This is why there are no withdrawal periods.');
    } else {
      console.log('\n⚠️  CAUSE: The treatment has medications but withdrawal periods were not calculated!');
      console.log('   This could be a bug in the withdrawal calculation logic.');
    }
  }
})();
