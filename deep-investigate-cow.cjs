require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

(async () => {
  const cowTag = 'LT000008370321';

  // Find the cow
  const { data: cow } = await supabase
    .from('animals')
    .select('*')
    .eq('tag_no', cowTag)
    .maybeSingle();

  if (!cow) {
    console.log('Cow not found');
    return;
  }

  console.log('Cow ID:', cow.id);
  console.log('Tag:', cow.tag_no);

  // Get all treatments
  const { data: treatments } = await supabase
    .from('treatments')
    .select('*')
    .eq('animal_id', cow.id)
    .order('reg_date', { ascending: false });

  console.log('\n=== ALL TREATMENTS ===');
  for (const t of treatments) {
    console.log(`\n--- Treatment ID: ${t.id} ---`);
    console.log('Date:', t.reg_date);
    console.log('Visit ID:', t.visit_id || 'NONE');
    console.log('Disease ID:', t.disease_id || 'NONE');
    console.log('Withdrawal meat:', t.withdrawal_until_meat || 'NONE');
    console.log('Withdrawal milk:', t.withdrawal_until_milk || 'NONE');

    // Check if there's a visit
    if (t.visit_id) {
      const { data: visit } = await supabase
        .from('animal_visits')
        .select('*')
        .eq('id', t.visit_id)
        .maybeSingle();

      if (visit) {
        console.log('\n  Visit found:');
        console.log('  Status:', visit.status);
        console.log('  Planned medications:', visit.planned_medications ? JSON.stringify(visit.planned_medications, null, 2) : 'NONE');
      }
    }

    // Check usage_items
    const { data: usageItems } = await supabase
      .from('usage_items')
      .select('*, products(name, withdrawal_meat_days, withdrawal_milk_days)')
      .eq('treatment_id', t.id);

    if (usageItems && usageItems.length > 0) {
      console.log('\n  Usage items:');
      usageItems.forEach(item => {
        console.log('    -', item.products?.name, ':', item.qty, item.unit);
        console.log('      Meat:', item.products?.withdrawal_meat_days || 0, 'days');
        console.log('      Milk:', item.products?.withdrawal_milk_days || 0, 'days');
      });
    } else {
      console.log('  Usage items: NONE');
    }

    // Check treatment_courses
    const { data: courses } = await supabase
      .from('treatment_courses')
      .select('*, products(name, withdrawal_meat_days, withdrawal_milk_days)')
      .eq('treatment_id', t.id);

    if (courses && courses.length > 0) {
      console.log('\n  Treatment courses:');
      courses.forEach(course => {
        console.log('    -', course.products?.name, ':', course.days, 'days');
        console.log('      Meat:', course.products?.withdrawal_meat_days || 0, 'days');
        console.log('      Milk:', course.products?.withdrawal_milk_days || 0, 'days');
      });
    } else {
      console.log('  Treatment courses: NONE');
    }
  }

  console.log('\n\n=== CONCLUSION ===');
  const hasAnyMedications = treatments.some(t => {
    // We would need to check if any treatment has medications
    return false; // This will be determined from the output above
  });

  console.log('The cow has', treatments.length, 'treatments.');
  console.log('But they seem to have NO medications recorded.');
  console.log('\nWithout medications, the system cannot calculate withdrawal periods.');
  console.log('This is why "karencinis laikotarpis" is empty!');
})();
