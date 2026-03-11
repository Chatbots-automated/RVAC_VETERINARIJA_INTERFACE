import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function findBatchFunctions() {
  console.log('Searching for functions and triggers that handle batches...\n');

  // Query pg_proc for functions containing 'batch'
  const { data: functions } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT 
        p.proname as function_name,
        pg_get_functiondef(p.oid) as definition
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
      AND (
        p.proname ILIKE '%batch%'
        OR p.proname ILIKE '%stock%'
        OR p.proname ILIKE '%deduct%'
      )
      ORDER BY p.proname;
    `
  }).maybeSingle();

  if (functions) {
    console.log('Functions found:', functions);
  } else {
    console.log('Trying direct query...');
    
    // Try to get error from actual usage_items insert
    const { data, error } = await supabase
      .from('usage_items')
      .insert({
        treatment_id: '00000000-0000-0000-0000-000000000000',
        product_id: '6e47d7bb-23df-4374-a72a-a1c22cdb0e6c',
        batch_id: '8d06ab83-be56-4757-adb7-9f5a6010c30f',
        qty: 5,
        unit: 'ml'
      })
      .select();

    console.log('Error:', error);
    console.log('Data:', data);
  }
}

findBatchFunctions().catch(console.error);
