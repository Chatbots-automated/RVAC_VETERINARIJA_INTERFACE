const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false
    }
  }
);

async function applyMigration() {
  try {
    const migrationSQL = fs.readFileSync('./supabase/migrations/20251230000000_fix_vaccination_stock_deduction.sql', 'utf8');

    console.log('🔧 Applying vaccination stock deduction fix...\n');

    // Execute the entire migration as one transaction
    const { data, error } = await supabase
      .from('_migrations')
      .select('*')
      .limit(1);

    if (error && error.code !== 'PGRST204') {
      console.log('Note: Cannot access migrations table, will try direct execution\n');
    }

    // For Supabase, we need to execute via the SQL editor or use pg library
    // Let's use pg library
    const { Client } = require('pg');

    // Construct connection string
    const projectRef = 'olxnahsxvyiadknybagt';
    const connectionString = `postgresql://postgres.${projectRef}:${process.env.VITE_SUPABASE_SERVICE_ROLE_KEY.substring(0, 20)}@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`;

    console.log('⚠️  Direct PostgreSQL connection requires database password.');
    console.log('Please apply the migration using one of these methods:\n');
    console.log('1. 📊 Supabase Dashboard SQL Editor:');
    console.log('   - Visit: https://supabase.com/dashboard/project/olxnahsxvyiadknybagt/sql/new');
    console.log('   - Copy contents from: supabase/migrations/20251230000000_fix_vaccination_stock_deduction.sql');
    console.log('   - Click "Run"\n');
    console.log('2. 🔧 Supabase CLI:');
    console.log('   - Run: supabase db push\n');
    console.log('3. 💻 Or I can show you the SQL to run manually\n');

  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

applyMigration();
