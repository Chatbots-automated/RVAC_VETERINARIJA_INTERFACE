const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

async function applyMigration() {
  try {
    console.log('Reading migration file...\n');
    const migrationSQL = fs.readFileSync('./vehicle-service-visits-migration.sql', 'utf8');

    console.log('Applying vehicle service visits migration...\n');

    const { Client } = require('pg');
    const connectionString = process.env.VITE_SUPABASE_URL.replace('https://', 'postgresql://postgres:')
      .replace('.supabase.co', '.supabase.co:5432/postgres')
      .replace('https', 'postgresql');

    console.log('\nTo apply this migration, please run the SQL from vehicle-service-visits-migration.sql');
    console.log('in your Supabase SQL Editor:\n');
    console.log(`https://supabase.com/dashboard/project/${process.env.VITE_SUPABASE_URL.split('//')[1].split('.')[0]}/sql/new\n`);

    console.log('Or use the Supabase CLI:');
    console.log('supabase db push\n');

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

applyMigration();
