const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing environment variables');
  console.error('VITE_SUPABASE_URL:', !!supabaseUrl);
  console.error('Service Role Key:', !!supabaseServiceKey);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyMigration() {
  try {
    console.log('Reading migration file...');
    const sql = fs.readFileSync(
      path.join(__dirname, 'apply-vehicle-parts-stock-deduction.sql'),
      'utf8'
    );

    console.log('Applying migration...');
    const { error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
      console.error('Error applying migration:', error);
      process.exit(1);
    }

    console.log('✓ Migration applied successfully!');
    console.log('Stock deduction triggers created for vehicle visit parts.');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

applyMigration();
