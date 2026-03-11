const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function checkDatabase() {
  console.log('Checking database state...\n');

  // Check tool_movements table
  const { data: toolMovements, error: tmError } = await supabase
    .from('tool_movements')
    .select('*')
    .limit(1);

  console.log('tool_movements query:', tmError || 'OK');

  // Check maintenance_work_orders table
  const { data: workOrders, error: woError } = await supabase
    .from('maintenance_work_orders')
    .select('*')
    .limit(1);

  console.log('maintenance_work_orders query:', woError || 'OK');

  // Check maintenance_schedules table
  const { data: schedules, error: schedError } = await supabase
    .from('maintenance_schedules')
    .select('*')
    .limit(1);

  console.log('maintenance_schedules query:', schedError || 'OK');

  // Try to call generate_work_order_number
  const { data: woNumber, error: rpcError } = await supabase
    .rpc('generate_work_order_number');

  console.log('\ngenerate_work_order_number RPC:', rpcError ? rpcError.message : woNumber);

  // Check users table
  const { data: users, error: userError } = await supabase
    .from('users')
    .select('id, full_name')
    .limit(5);

  if (userError) {
    console.log('\nusers query error:', userError);
  } else {
    console.log('\nSample users:', users);
  }

  // Check tools table
  const { data: tools, error: toolError } = await supabase
    .from('tools')
    .select('id, tool_number, is_available, current_holder')
    .limit(5);

  if (toolError) {
    console.log('\ntools query error:', toolError);
  } else {
    console.log('\nSample tools:', tools);
  }
}

checkDatabase().catch(console.error);
