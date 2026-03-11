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
    const migrationSQL = fs.readFileSync('./milk-loss-tracking-migration.sql', 'utf8');

    console.log('🔧 Applying milk loss tracking migration...\n');
    console.log('⚠️  Please apply the migration using the Supabase Dashboard SQL Editor:\n');
    console.log('1. 📊 Visit: https://supabase.com/dashboard/project/olxnahsxvyiadknybagt/sql/new');
    console.log('2. 📋 Copy contents from: milk-loss-tracking-migration.sql');
    console.log('3. ▶️  Click "Run"\n');
    console.log('This migration creates:');
    console.log('  ✓ calculate_average_daily_milk() function');
    console.log('  ✓ calculate_milk_loss_for_treatment() function');
    console.log('  ✓ animal_milk_loss_by_treatment view\n');

  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

applyMigration();
