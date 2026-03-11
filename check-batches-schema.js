import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function checkBatchesSchema() {
  console.log('Checking batches table for test produktas...\n');

  const productId = '6e47d7bb-23df-4374-a72a-a1c22cdb0e6c';

  // Try getting all columns
  const { data: batches, error } = await supabase
    .from('batches')
    .select('*')
    .eq('product_id', productId);

  if (error) {
    console.log('ERROR:', error);
    return;
  }

  console.log('Raw batch data:');
  console.log(JSON.stringify(batches, null, 2));
}

checkBatchesSchema().catch(console.error);
