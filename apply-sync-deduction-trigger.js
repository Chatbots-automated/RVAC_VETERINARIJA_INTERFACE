import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function applyMigration() {
  try {
    console.log('📖 Reading migration file...\n');
    const sql = readFileSync('./sync_step_deduction.sql', 'utf8');

    console.log('🔧 Applying synchronization step stock deduction trigger...\n');

    // Split SQL into individual statements
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('/*') && !s.startsWith('--'));

    console.log(`Found ${statements.length} SQL statements to execute\n`);

    // Since we can't execute raw SQL via Supabase JS client,
    // we need to use the Supabase Dashboard SQL Editor
    console.log('⚠️  To apply this migration, please use the Supabase Dashboard:\n');
    console.log('1. 📊 Visit: https://supabase.com/dashboard/project/olxnahsxvyiadknybagt/sql/new');
    console.log('2. 📋 Copy the contents from: sync_step_deduction.sql');
    console.log('3. ▶️  Click "Run"\n');

    console.log('Or copy and paste this SQL:\n');
    console.log('─'.repeat(80));
    console.log(sql);
    console.log('─'.repeat(80));
    console.log('\n✅ After running the SQL, the trigger will be active!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

applyMigration();
