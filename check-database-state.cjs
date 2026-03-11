const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function checkDatabase() {
  console.log('Checking database state...\n');

  // Check tool_movements foreign keys
  const { data: toolMovementsFKs, error: fkError } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT conname, pg_get_constraintdef(oid) AS constraint_definition
      FROM pg_constraint
      WHERE conrelid = 'tool_movements'::regclass
      AND contype = 'f';
    `
  });

  if (fkError) {
    console.log('Error checking tool_movements FKs:', fkError);
  } else {
    console.log('tool_movements Foreign Keys:', JSON.stringify(toolMovementsFKs, null, 2));
  }

  // Check if RPC function exists
  const { data: rpcFunctions, error: rpcError } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT routine_name
      FROM information_schema.routines
      WHERE routine_schema = 'public'
      AND routine_name LIKE '%work_order%';
    `
  });

  if (rpcError) {
    console.log('\nError checking RPC functions:', rpcError);
  } else {
    console.log('\nWork Order RPC Functions:', JSON.stringify(rpcFunctions, null, 2));
  }

  // Check maintenance_work_orders columns
  const { data: workOrderCols, error: colError } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'maintenance_work_orders'
      ORDER BY ordinal_position;
    `
  });

  if (colError) {
    console.log('\nError checking work orders columns:', colError);
  } else {
    console.log('\nmaintenance_work_orders Columns:', JSON.stringify(workOrderCols, null, 2));
  }

  // Check maintenance_schedules structure
  const { data: scheduleCols, error: schedError } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'maintenance_schedules'
      ORDER BY ordinal_position;
    `
  });

  if (schedError) {
    console.log('\nError checking schedules columns:', schedError);
  } else {
    console.log('\nmaintenance_schedules Columns:', JSON.stringify(scheduleCols, null, 2));
  }
}

checkDatabase().catch(console.error);
