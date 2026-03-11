import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function checkBiocideUnit() {
  console.log('Checking biocide_usage table structure...\n');

  // Check what units are used in existing biocide_usage records
  const { data, error } = await supabase
    .from('biocide_usage')
    .select('unit')
    .limit(10);

  if (error) {
    console.log('Error:', error.message);
  } else {
    console.log('Sample units from biocide_usage:');
    const units = [...new Set(data.map(d => d.unit))];
    console.log(units);
  }
}

checkBiocideUnit();
