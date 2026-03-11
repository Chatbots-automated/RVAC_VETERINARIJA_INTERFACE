const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  // Search for the animal
  const { data: animals } = await supabase
    .from('animals')
    .select('*')
    .or('tag_no.eq.131,tag_no.eq.LT000008564387,internal_id.eq.131')
    .limit(5);

  console.log('Found animals:', animals?.length || 0);

  if (!animals || animals.length === 0) {
    console.log('No animal found. Let me search for any with 131 in tag...');

    const { data: similar } = await supabase
      .from('animals')
      .select('*')
      .ilike('tag_no', '%131%')
      .limit(5);

    console.log('Animals with 131 in tag:', similar?.length || 0);
    similar?.forEach(a => console.log(`  - ${a.tag_no}`));
    return;
  }

  const animal = animals[0];
  console.log(`\nAnimal: ${animal.tag_no} (ID: ${animal.id})`);

  // Get recent treatments
  const { data: treatments } = await supabase
    .from('treatments')
    .select(`
      *,
      usage_items (
        id,
        qty,
        unit,
        product:products (
          name,
          withdrawal_days_meat,
          withdrawal_days_milk
        )
      )
    `)
    .eq('animal_id', animal.id)
    .order('reg_date', { ascending: false })
    .limit(5);

  console.log(`\nRecent Treatments: ${treatments?.length || 0}`);

  treatments?.forEach(t => {
    console.log(`\n--- Treatment ${t.id} on ${t.reg_date} ---`);
    console.log(`  Diagnosis: ${t.diagnosis}`);
    console.log(`  Withdrawal until meat: ${t.withdrawal_until_meat}`);
    console.log(`  Withdrawal until milk: ${t.withdrawal_until_milk}`);
    console.log(`  Medications: ${t.usage_items?.length || 0}`);
    t.usage_items?.forEach(ui => {
      console.log(`    - ${ui.product.name}: ${ui.qty} ${ui.unit}`);
      console.log(`      Withdrawal: Meat ${ui.product.withdrawal_days_meat} days, Milk ${ui.product.withdrawal_days_milk} days`);
    });
  });

  // Check current date for comparison
  console.log(`\n--- Current Date: ${new Date().toISOString().split('T')[0]} ---`);
})();
