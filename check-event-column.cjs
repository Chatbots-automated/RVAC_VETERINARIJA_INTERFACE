require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkColumn() {
  console.log('Checking milk_weights table structure...');

  const { data, error } = await supabase
    .from('milk_weights')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Sample row:', data[0]);
    console.log('Columns:', Object.keys(data[0] || {}));
  }
}

checkColumn();
