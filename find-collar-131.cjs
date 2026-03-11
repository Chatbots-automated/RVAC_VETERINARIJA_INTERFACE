const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  // Find animal with collar 131
  const { data: collar } = await supabase
    .from('vw_animal_latest_collar')
    .select('*')
    .eq('collar_no', 131)
    .maybeSingle();

  if (!collar) {
    console.log('No animal found with collar 131');
    return;
  }

  console.log('Found collar:', collar);

  // Get the animal details
  const { data: animal } = await supabase
    .from('animals')
    .select('*')
    .eq('id', collar.animal_id)
    .single();

  console.log(`\nAnimal: ${animal.tag_no} (ID: ${animal.id})`);

  // Get recent treatments with medications
  const { data: treatments } = await supabase
    .from('treatments')
    .select(`
      *,
      usage_items (
        id,
        qty,
        unit,
        purpose,
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

  console.log(`\n=== Recent Treatments: ${treatments?.length || 0} ===`);

  treatments?.forEach(t => {
    console.log(`\n--- Treatment on ${t.reg_date} ---`);
    console.log(`  Treatment ID: ${t.id}`);
    console.log(`  Diagnosis: ${t.diagnosis}`);
    console.log(`  Withdrawal until meat: ${t.withdrawal_until_meat}`);
    console.log(`  Withdrawal until milk: ${t.withdrawal_until_milk}`);
    console.log(`  Medications: ${t.usage_items?.length || 0}`);

    if (t.usage_items && t.usage_items.length > 0) {
      t.usage_items.forEach(ui => {
        console.log(`    - ${ui.product.name}`);
        console.log(`      Qty: ${ui.qty} ${ui.unit}, Purpose: ${ui.purpose}`);
        console.log(`      Withdrawal days: Meat ${ui.product.withdrawal_days_meat}, Milk ${ui.product.withdrawal_days_milk}`);
      });
    }
  });

  console.log(`\n--- Today's Date: ${new Date().toISOString().split('T')[0]} ---`);
})();
