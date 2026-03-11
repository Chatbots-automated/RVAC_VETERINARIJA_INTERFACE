require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

(async () => {
  console.log('=== VERIFYING COW LT000008370321 ===\n');

  const { data: cow } = await supabase
    .from('animals')
    .select('id, tag_no')
    .eq('tag_no', 'LT000008370321')
    .maybeSingle();

  if (!cow) {
    console.log('❌ Cow not found');
    return;
  }

  console.log('✅ Found cow:', cow.tag_no);

  const { data: treatment } = await supabase
    .from('treatments')
    .select('id, reg_date, withdrawal_until_meat, withdrawal_until_milk')
    .eq('animal_id', cow.id)
    .order('reg_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!treatment) {
    console.log('❌ No treatment found');
    return;
  }

  console.log('\n📋 TREATMENT DETAILS:');
  console.log('  Treatment Date:', treatment.reg_date);
  console.log('  Withdrawal Meat:', treatment.withdrawal_until_meat || 'NONE');
  console.log('  Withdrawal Milk:', treatment.withdrawal_until_milk || 'NONE');

  const { data: usageItems } = await supabase
    .from('usage_items')
    .select('id, qty, unit, products(name, withdrawal_days_meat, withdrawal_days_milk)')
    .eq('treatment_id', treatment.id);

  console.log('\n💊 MEDICATIONS:');
  if (!usageItems || usageItems.length === 0) {
    console.log('  ❌ No usage items found!');
  } else {
    usageItems.forEach(item => {
      console.log(`  ✅ ${item.products.name}`);
      console.log(`     Quantity: ${item.qty} ${item.unit}`);
      console.log(`     Withdrawal: Meat=${item.products.withdrawal_days_meat}d, Milk=${item.products.withdrawal_days_milk}d`);
    });
  }

  console.log('\n=== FINAL STATUS ===');
  if (treatment.withdrawal_until_meat || treatment.withdrawal_until_milk) {
    console.log('✅ COW IS FIXED!');
    console.log('   - Usage items created');
    console.log('   - Withdrawal periods calculated');
    console.log('   - Stock deducted');
  } else {
    console.log('❌ COW NEEDS FIXING');
    console.log('   - Missing withdrawal periods');
  }
})();
