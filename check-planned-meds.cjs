require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

(async () => {
  // The two product IDs from the planned medications
  const productIds = [
    'd17f826c-ae95-4fe0-8b04-c41470071537',
    '03be25f7-fe6a-4275-b2eb-d325cb97cc11'
  ];

  console.log('=== PLANNED MEDICATIONS ===\n');

  for (const productId of productIds) {
    const { data: product } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .maybeSingle();

    if (product) {
      console.log('Product:', product.name);
      console.log('  Withdrawal meat:', product.withdrawal_meat_days || 0, 'days');
      console.log('  Withdrawal milk:', product.withdrawal_milk_days || 0, 'days');
      console.log('  Category:', product.category);
      console.log('');
    }
  }

  console.log('=== THE PROBLEM ===');
  console.log('The visit was marked as "Baigtas" (Completed)');
  console.log('BUT the planned medications were NEVER converted to usage_items!');
  console.log('\nWithout usage_items, the system cannot:');
  console.log('  1. Calculate withdrawal periods for the treatment');
  console.log('  2. Deduct stock from inventory');
  console.log('  3. Show medications in the treatment history');
  console.log('\nThis is a bug in the visit completion logic!');
})();
