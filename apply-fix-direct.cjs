const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function applyFixes() {
  console.log('Applying fixes to Technika module...\n');

  // Step 1: Create the generate_work_order_number function first (most important)
  console.log('1. Creating generate_work_order_number function...');
  try {
    const { error } = await supabase.rpc('exec_sql', {
      sql: `
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
      `
    });

    if (error) throw error;
    console.log('✅ Function created');
  } catch (err) {
    console.log('❌ Error (trying alternative method):', err.message);

    // Try direct SQL via POST
    const response = await fetch(`${process.env.VITE_SUPABASE_URL}/rest/v1/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${process.env.VITE_SUPABASE_SERVICE_ROLE_KEY}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        query: `
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
        `
      })
    });

    if (!response.ok) {
      console.log('❌ Could not create function via REST API');
      console.log('You need to manually execute this SQL in Supabase Dashboard:');
      console.log(`
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
      `);
    }
  }

  // Step 2: Test the function
  console.log('\n2. Testing generate_work_order_number...');
  const { data: woNum, error: woError } = await supabase.rpc('generate_work_order_number');
  if (woError) {
    console.log('❌ Function test failed:', woError.message);
  } else {
    console.log('✅ Function works! Next number:', woNum);
  }

  // Step 3: Check tool_movements constraints
  console.log('\n3. Checking tool_movements table...');
  const { data: toolTest, error: toolError } = await supabase
    .from('tool_movements')
    .select('id')
    .limit(1);

  if (toolError) {
    console.log('❌ tool_movements error:', toolError.message);
  } else {
    console.log('✅ tool_movements table accessible');
  }

  console.log('\n' + '='.repeat(80));
  console.log('MANUAL STEPS REQUIRED:');
  console.log('='.repeat(80));
  console.log('\nGo to Supabase Dashboard SQL Editor and run this:');
  console.log(`\nhttps://supabase.com/dashboard/project/olxnahsxvyiadknybagt/sql/new\n`);
  console.log(`
-- Fix tool_movements foreign keys
ALTER TABLE tool_movements DROP CONSTRAINT IF EXISTS tool_movements_to_holder_fkey;
ALTER TABLE tool_movements DROP CONSTRAINT IF EXISTS tool_movements_from_holder_fkey;
ALTER TABLE tool_movements DROP CONSTRAINT IF EXISTS tool_movements_recorded_by_fkey;

ALTER TABLE tool_movements ADD CONSTRAINT tool_movements_to_holder_fkey FOREIGN KEY (to_holder) REFERENCES users(id);
ALTER TABLE tool_movements ADD CONSTRAINT tool_movements_from_holder_fkey FOREIGN KEY (from_holder) REFERENCES users(id);
ALTER TABLE tool_movements ADD CONSTRAINT tool_movements_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES users(id);

-- Add status column if missing
ALTER TABLE maintenance_work_orders ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending';

-- Create trigger for schedule completion
CREATE OR REPLACE FUNCTION update_schedule_on_work_order_complete()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') AND NEW.schedule_id IS NOT NULL THEN
    UPDATE maintenance_schedules
    SET last_completed_date = COALESCE(NEW.completed_date, NOW())
    WHERE id = NEW.schedule_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_schedule_on_complete ON maintenance_work_orders;
CREATE TRIGGER trigger_update_schedule_on_complete
  AFTER UPDATE OF status ON maintenance_work_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_schedule_on_work_order_complete();
  `);
}

applyFixes().catch(console.error);
