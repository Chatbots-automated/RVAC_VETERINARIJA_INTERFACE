const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  // Find the animal by collar
  const { data: animal, error: animalError } = await supabase
    .from('animals')
    .select('*')
    .eq('collar', '131')
    .maybeSingle();

  if (!animal) {
    console.log('Animal not found with collar 131');
    console.log('Error:', animalError);
    return;
  }

  console.log('Animal:', animal.id, animal.ear_tag, animal.collar);

  // Get recent treatments
  const { data: treatments, error: treatError } = await supabase
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

  console.log(`\nRecent Treatments (found ${treatments?.length || 0}):`);
  if (treatError) {
    console.log('Error:', treatError);
  }

  treatments?.forEach(t => {
    console.log(`\n--- Treatment ${t.id} on ${t.reg_date} ---`);
    console.log(`  Withdrawal until meat: ${t.withdrawal_until_meat}`);
    console.log(`  Withdrawal until milk: ${t.withdrawal_until_milk}`);
    console.log(`  Medications (${t.usage_items?.length || 0}):`);
    t.usage_items?.forEach(ui => {
      console.log(`    - ${ui.product.name}: ${ui.qty} ${ui.unit}`);
      console.log(`      Meat: ${ui.product.withdrawal_days_meat} days, Milk: ${ui.product.withdrawal_days_milk} days`);
    });
  });
})();
