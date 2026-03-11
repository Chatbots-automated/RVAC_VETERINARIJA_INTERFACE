import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function checkSchema() {
  console.log('\n=== CHECKING USAGE_ITEMS SCHEMA ===\n');

  // Try to fetch one record to understand structure
  const { data, error } = await supabase
    .from('usage_items')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Sample record:');
    console.log(JSON.stringify(data, null, 2));
  }

  // Check if batch_id is nullable
  const { data: allData, error: allError } = await supabase
    .from('usage_items')
    .select('id, treatment_id, product_id, batch_id, qty, unit')
    .limit(5);

  if (allError) {
    console.error('Error fetching records:', allError);
  } else {
    console.log('\nRecent usage_items:');
    console.table(allData);
  }
}

checkSchema().catch(console.error);
