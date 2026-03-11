import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function checkViewDefinition() {
  console.log('🔬 Checking vw_treated_animals view definition...\n');

  // First try with supabase client
  const { data, error } = await supabase.rpc('exec_raw_sql', {
    query: `
      SELECT pg_get_viewdef('vw_treated_animals'::regclass, true) as view_def;
    `
  });

  if (error) {
    console.log('Cannot query view def via RPC:', error.message);
  } else if (data) {
    console.log('View definition:');
    console.log(data);
  }

  // Check what columns the view actually has
  const { data: sample } = await supabase
    .from('vw_treated_animals')
    .select('*')
    .limit(1);

  if (sample && sample.length > 0) {
    console.log('\n\nColumns in vw_treated_animals:');
    Object.keys(sample[0]).forEach(col => {
      const val = sample[0][col];
      const preview = val ? String(val).substring(0, 50) : 'null';
      console.log(`   ${col}: ${preview}`);
    });
  }
}

checkViewDefinition().catch(console.error);
