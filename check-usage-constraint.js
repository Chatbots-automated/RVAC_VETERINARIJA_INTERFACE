import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function checkTriggers() {
  const { data, error } = await supabase
    .from('usage_items')
    .select('*')
    .limit(0);
  
  console.log('Checking for triggers on usage_items...');
  
  // Try to get trigger info via a test query
  const { data: testData, error: testError } = await supabase.rpc('get_batch_qty_left', {
    p_batch_id: 'ba9daf59-b198-4036-bc9e-ea85f45f7854'
  });
  
  if (testError) {
    console.log('RPC error:', testError);
  } else {
    console.log('Batch qty left:', testData);
  }
}

checkTriggers();
