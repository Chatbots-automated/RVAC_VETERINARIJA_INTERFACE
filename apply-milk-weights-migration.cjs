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
    console.log('🔧 Applying milk weights tracking migration...\n');
    console.log('⚠️  Direct PostgreSQL connection requires database password.');
    console.log('Please apply the migration using one of these methods:\n');
    console.log('1. 📊 Supabase Dashboard SQL Editor:');
    console.log('   - Visit: https://supabase.com/dashboard/project/olxnahsxvyiadknybagt/sql/new');
    console.log('   - Copy contents from: milk-weights-migration.sql');
    console.log('   - Click "Run"\n');
    console.log('2. 💻 The SQL file has been created at: milk-weights-migration.sql\n');
    console.log('📋 This migration creates:');
    console.log('   - milk_weights table to store daily milking session data');
    console.log('   - Functions to determine session type and upsert webhook data');
    console.log('   - RLS policies for data access\n');
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

applyMigration();
