require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function addParentIdColumn() {
  try {
    console.log('Adding parent_id column to cost_centers...\n');

    // Add parent_id column
    const { error } = await supabase.rpc('exec_sql', {
      sql: `
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'cost_centers' AND column_name = 'parent_id'
          ) THEN
            ALTER TABLE cost_centers
            ADD COLUMN parent_id uuid REFERENCES cost_centers(id) ON DELETE CASCADE;

            CREATE INDEX IF NOT EXISTS idx_cost_centers_parent_id ON cost_centers(parent_id);
          END IF;
        END $$;
      `
    });

    if (error) {
      console.error('Error:', error);
      process.exit(1);
    }

    console.log('✓ parent_id column added successfully!');
    console.log('✓ Foreign key constraint created');
    console.log('✓ Index created');
    console.log('\nYou can now create nested cost centers!');

  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

addParentIdColumn();
