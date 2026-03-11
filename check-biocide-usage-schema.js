import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function checkSchema() {
  const { data, error } = await supabase
    .from('biocide_usage')
    .select('*')
    .limit(1);
  
  if (error) {
    console.log('Error:', error);
  } else {
    console.log('biocide_usage sample row:', data[0]);
    console.log('\nColumns:', Object.keys(data[0] || {}));
  }
}

checkSchema();
