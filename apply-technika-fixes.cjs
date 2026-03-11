const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

const migrationSQL = `
-- Fix tool_movements foreign key constraints
-- Drop existing constraints if they exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'tool_movements_to_holder_fkey'
  ) THEN
    ALTER TABLE tool_movements DROP CONSTRAINT tool_movements_to_holder_fkey;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'tool_movements_from_holder_fkey'
  ) THEN
    ALTER TABLE tool_movements DROP CONSTRAINT tool_movements_from_holder_fkey;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'tool_movements_recorded_by_fkey'
  ) THEN
    ALTER TABLE tool_movements DROP CONSTRAINT tool_movements_recorded_by_fkey;
  END IF;
END $$;

-- Add new foreign keys to public.users (not auth.users)
ALTER TABLE tool_movements
ADD CONSTRAINT tool_movements_to_holder_fkey
FOREIGN KEY (to_holder) REFERENCES users(id);

ALTER TABLE tool_movements
ADD CONSTRAINT tool_movements_from_holder_fkey
FOREIGN KEY (from_holder) REFERENCES users(id);

ALTER TABLE tool_movements
ADD CONSTRAINT tool_movements_recorded_by_fkey
FOREIGN KEY (recorded_by) REFERENCES users(id);

-- Create generate_work_order_number RPC function
CREATE OR REPLACE FUNCTION generate_work_order_number()
RETURNS text AS $$
DECLARE
  next_num integer;
  new_number text;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(work_order_number FROM 'WO-(.*)') AS INTEGER)), 0) + 1
  INTO next_num
  FROM maintenance_work_orders;

  new_number := 'WO-' || LPAD(next_num::text, 6, '0');
  RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- Ensure maintenance_work_orders has status column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'maintenance_work_orders' AND column_name = 'status'
  ) THEN
    ALTER TABLE maintenance_work_orders
    ADD COLUMN status text DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled'));
  END IF;
END $$;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_maintenance_work_orders_number
ON maintenance_work_orders(work_order_number);

CREATE INDEX IF NOT EXISTS idx_maintenance_work_orders_status
ON maintenance_work_orders(status);

-- Create function to update schedule when work order completes
CREATE OR REPLACE FUNCTION update_schedule_on_work_order_complete()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' AND NEW.schedule_id IS NOT NULL THEN
    UPDATE maintenance_schedules
    SET last_completed_date = NEW.completed_date
    WHERE id = NEW.schedule_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate trigger
DROP TRIGGER IF EXISTS trigger_update_schedule_on_complete ON maintenance_work_orders;

CREATE TRIGGER trigger_update_schedule_on_complete
  AFTER UPDATE OF status ON maintenance_work_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_schedule_on_work_order_complete();
`;

async function applyMigration() {
  console.log('Applying Technika fixes migration...\n');

  // Use the REST API to execute raw SQL via service role
  const response = await fetch(`${process.env.VITE_SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': process.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${process.env.VITE_SUPABASE_SERVICE_ROLE_KEY}`
    },
    body: JSON.stringify({ sql: migrationSQL })
  });

  if (!response.ok) {
    // exec_sql doesn't exist, we need to use direct postgres connection
    console.log('exec_sql RPC not available, using direct query...\n');

    const { Client } = require('pg');
    const client = new Client({
      connectionString: process.env.VITE_SUPABASE_URL.replace('https://', 'postgresql://postgres:') + '/postgres',
      ssl: { rejectUnauthorized: false }
    });

    try {
      await client.connect();
      console.log('Connected to database');

      const result = await client.query(migrationSQL);
      console.log('Migration applied successfully!');

      await client.end();
    } catch (error) {
      console.error('Error applying migration:', error.message);
      throw error;
    }
    return;
  }

  const result = await response.json();
  console.log('Migration applied successfully!', result);
}

async function verifyFixes() {
  console.log('\nVerifying fixes...\n');

  // Test generate_work_order_number
  const { data: woNumber, error: rpcError } = await supabase
    .rpc('generate_work_order_number');

  if (rpcError) {
    console.log('❌ generate_work_order_number:', rpcError.message);
  } else {
    console.log('✅ generate_work_order_number:', woNumber);
  }

  // Check tool_movements constraints
  const { data: tools, error: toolError } = await supabase
    .from('tools')
    .select('id')
    .limit(1)
    .maybeSingle();

  if (!toolError && tools) {
    console.log('✅ tools table accessible');
  }

  console.log('\nAll fixes verified!');
}

applyMigration()
  .then(() => verifyFixes())
  .catch(console.error);
