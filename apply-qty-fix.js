import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function applyFix() {
  console.log('🔧 Applying null qty trigger fix...');

  const sql = readFileSync('fix-null-qty-trigger.sql', 'utf8');

  const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql }).maybeSingle();

  if (error) {
    console.error('❌ Error applying fix:', error);

    // Try alternative method
    console.log('Trying direct query...');
    const { error: directError } = await supabase.from('_migrations').select('*').limit(1);

    if (directError) {
      console.error('Cannot access database');
      process.exit(1);
    }

    // Parse and execute SQL statements one by one
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('/*') && !s.startsWith('--'));

    for (const statement of statements) {
      if (statement.trim()) {
        console.log('Executing statement...');
        const { error: stmtError } = await supabase.rpc('exec_sql', { sql_query: statement });
        if (stmtError) {
          console.error('Error:', stmtError.message);
        }
      }
    }
  } else {
    console.log('✅ Fix applied successfully');
  }
}

applyFix().catch(console.error);
