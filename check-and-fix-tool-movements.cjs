// Script to check and fix tool_movements foreign key constraints
// Run this with: node check-and-fix-tool-movements.cjs

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing environment variables. Check your .env file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
});

async function checkAndFix() {
  console.log('=== Checking Users in Database ===\n');

  // Check public.users
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, email, role, full_name')
    .order('created_at', { ascending: false })
    .limit(10);

  if (usersError) {
    console.error('Error fetching users:', usersError);
  } else {
    console.log('Users in public.users:');
    console.table(users);
  }

  console.log('\n=== Fixing Foreign Key Constraints ===\n');

  // Drop and recreate constraints with proper NULL handling
  const fixSQL = `
    -- Fix tool_movements_recorded_by_fkey
    ALTER TABLE tool_movements
      DROP CONSTRAINT IF EXISTS tool_movements_recorded_by_fkey;

    ALTER TABLE tool_movements
      ADD CONSTRAINT tool_movements_recorded_by_fkey
      FOREIGN KEY (recorded_by)
      REFERENCES users(id)
      ON DELETE SET NULL;

    -- Fix tool_movements_to_holder_fkey
    ALTER TABLE tool_movements
      DROP CONSTRAINT IF EXISTS tool_movements_to_holder_fkey;

    ALTER TABLE tool_movements
      ADD CONSTRAINT tool_movements_to_holder_fkey
      FOREIGN KEY (to_holder)
      REFERENCES users(id)
      ON DELETE SET NULL;

    -- Fix tool_movements_from_holder_fkey
    ALTER TABLE tool_movements
      DROP CONSTRAINT IF EXISTS tool_movements_from_holder_fkey;

    ALTER TABLE tool_movements
      ADD CONSTRAINT tool_movements_from_holder_fkey
      FOREIGN KEY (from_holder)
      REFERENCES users(id)
      ON DELETE SET NULL;
  `;

  try {
    // Execute the fix using rpc if available
    const { data, error } = await supabase.rpc('exec_sql', { sql: fixSQL });

    if (error) {
      console.error('Error executing SQL (rpc not available):', error.message);
      console.log('\n⚠️  Could not apply fix via RPC. You need to run this SQL manually in Supabase SQL Editor:');
      console.log('\n' + fixSQL);
    } else {
      console.log('✅ Foreign key constraints fixed successfully!');
    }
  } catch (err) {
    console.error('Error:', err.message);
    console.log('\n⚠️  Could not apply fix. Run this SQL manually in Supabase SQL Editor:');
    console.log('\n' + fixSQL);
  }

  console.log('\n=== Checking Recent Tool Movements ===\n');

  const { data: movements, error: movError } = await supabase
    .from('tool_movements')
    .select('id, tool_id, movement_type, recorded_by, created_at')
    .order('created_at', { ascending: false })
    .limit(5);

  if (movError) {
    console.error('Error fetching tool_movements:', movError);
  } else {
    console.log('Recent Tool Movements:');
    console.table(movements);
  }
}

checkAndFix().catch(console.error);
