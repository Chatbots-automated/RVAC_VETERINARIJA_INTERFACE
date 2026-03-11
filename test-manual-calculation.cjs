const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  console.log('=== Manually Testing Withdrawal Calculation ===\n');

  // Find collar 131
  const { data: collar } = await supabase
    .from('vw_animal_latest_collar')
    .select('animal_id, collar_no')
    .eq('collar_no', 131)
    .maybeSingle();

  if (!collar) {
    console.log('Could not find collar 131');
    return;
  }

  // Get the treatment BEFORE calling function
  const { data: treatmentBefore } = await supabase
    .from('treatments')
    .select(`
      id,
      reg_date,
      withdrawal_until_meat,
      withdrawal_until_milk,
      usage_items (
        product:products (name, withdrawal_days_meat, withdrawal_days_milk)
      )
    `)
    .eq('animal_id', collar.animal_id)
    .order('reg_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!treatmentBefore) {
    console.log('No treatment found');
    return;
  }

  console.log('BEFORE calling calculate_withdrawal_dates:');
  console.log(`  Treatment Date: ${treatmentBefore.reg_date}`);
  console.log(`  Meat: ${treatmentBefore.withdrawal_until_meat}`);
  console.log(`  Milk: ${treatmentBefore.withdrawal_until_milk}`);

  // Manually call the function
  console.log(`\nCalling calculate_withdrawal_dates('${treatmentBefore.id}')...`);

  const { data: result, error } = await supabase.rpc('calculate_withdrawal_dates', {
    p_treatment_id: treatmentBefore.id
  });

  if (error) {
    console.log('❌ Error:', error);
    return;
  }

  console.log('✓ Function executed');

  // Get the treatment AFTER calling function
  const { data: treatmentAfter } = await supabase
    .from('treatments')
    .select('*')
    .eq('id', treatmentBefore.id)
    .single();

  console.log('\nAFTER calling calculate_withdrawal_dates:');
  console.log(`  Meat: ${treatmentAfter.withdrawal_until_meat}`);
  console.log(`  Milk: ${treatmentAfter.withdrawal_until_milk}`);

  if (treatmentAfter.withdrawal_until_meat && treatmentAfter.withdrawal_until_milk) {
    console.log('\n✅ SUCCESS! Withdrawal dates calculated correctly!');
    console.log('\nExpected:');
    console.log(`  Meat: 2026-02-02 (${treatmentBefore.reg_date} + 4 days + 1 safety)`);
    console.log(`  Milk: 2026-02-03 (${treatmentBefore.reg_date} + 5 days + 1 safety)`);
  } else {
    console.log('\n❌ Withdrawal dates still NULL');
  }
})();
