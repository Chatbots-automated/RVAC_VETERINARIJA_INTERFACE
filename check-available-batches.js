import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function checkBatches() {
  console.log('Checking batches with stock...\n');

  const { data, error } = await supabase
    .from('batches')
    .select('id, batch_number, qty_left')
    .order('qty_left', { ascending: false })
    .limit(10);

  if (error) {
    console.log('Error:', error.message);
    return;
  }

  console.log('Top 10 batches by qty_left:');
  data.forEach(b => {
    console.log(`  ${b.batch_number}: ${b.qty_left}`);
  });

  const positiveStock = data.filter(b => b.qty_left > 0);
  console.log(`\nBatches with positive stock: ${positiveStock.length}`);
}

checkBatches();
