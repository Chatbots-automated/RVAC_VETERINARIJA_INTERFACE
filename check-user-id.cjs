// Script to check user IDs and foreign key constraints
// Run this with: node check-user-id.cjs

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

async function checkDatabase() {
  console.log('=== Checking User Tables ===\n');

  // Check public.users
  const { data: publicUsers, error: publicError } = await supabase
    .from('users')
    .select('id, email, role, full_name')
    .order('created_at', { ascending: false })
    .limit(5);

  if (publicError) {
    console.error('Error fetching public.users:', publicError);
  } else {
    console.log('Public Users (public.users):');
    console.table(publicUsers);
  }

  console.log('\n=== Checking Foreign Key Constraints ===\n');

  // Check tool_movements constraints
  const { data: constraints } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT
        tc.constraint_name,
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        rc.update_rule,
        rc.delete_rule
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      JOIN information_schema.referential_constraints AS rc
        ON tc.constraint_name = rc.constraint_name
      WHERE tc.table_name IN ('tool_movements', 'vehicles')
        AND tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name IN ('recorded_by', 'created_by', 'to_holder', 'from_holder', 'assigned_to')
      ORDER BY tc.table_name, tc.constraint_name;
    `
  });

  if (constraints) {
    console.log('Foreign Key Constraints:');
    console.table(constraints);
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

checkDatabase().catch(console.error);
