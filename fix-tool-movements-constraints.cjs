// Script to fix tool_movements foreign key constraints
// Run this with: node fix-tool-movements-constraints.cjs

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing environment variables. Check your .env file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
});

const migration = `
-- Fix tool_movements foreign key constraints to allow NULL values
-- Drop existing constraints
ALTER TABLE tool_movements
  DROP CONSTRAINT IF EXISTS tool_movements_recorded_by_fkey;

ALTER TABLE tool_movements
  DROP CONSTRAINT IF EXISTS tool_movements_to_holder_fkey;

-- Recreate constraints with ON DELETE SET NULL
ALTER TABLE tool_movements
  ADD CONSTRAINT tool_movements_recorded_by_fkey
  FOREIGN KEY (recorded_by)
  REFERENCES users(id)
  ON DELETE SET NULL;

ALTER TABLE tool_movements
  ADD CONSTRAINT tool_movements_to_holder_fkey
  FOREIGN KEY (to_holder)
  REFERENCES users(id)
  ON DELETE SET NULL;
`;

async function applyFix() {
  console.log('Applying tool_movements foreign key constraint fix...');

  try {
    const { error } = await supabase.rpc('exec_sql', { sql: migration });

    if (error) {
      console.error('Error applying fix:', error);
      process.exit(1);
    }

    console.log('Successfully fixed tool_movements foreign key constraints!');
    console.log('The constraints now allow NULL values for recorded_by and to_holder.');
  } catch (err) {
    console.error('Unexpected error:', err);
    process.exit(1);
  }
}

applyFix();
