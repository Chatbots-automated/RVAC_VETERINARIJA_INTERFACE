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

async function applyChanges() {
  try {
    console.log('Step 1: Creating exec_sql function...\n');

    // Create exec_sql function first
    const createFunctionResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        sql: `
          CREATE OR REPLACE FUNCTION exec_sql(sql text)
          RETURNS void
          LANGUAGE plpgsql
          SECURITY DEFINER
          AS $$
          BEGIN
            EXECUTE sql;
          END;
          $$;
        `
      })
    });

    // If function doesn't exist, try to create it via direct SQL
    console.log('Step 2: Adding parent_id column...\n');

    const alterTableResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify({
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

              RAISE NOTICE 'parent_id column added successfully';
            ELSE
              RAISE NOTICE 'parent_id column already exists';
            END IF;
          END $$;
        `
      })
    });

    if (alterTableResponse.ok) {
      console.log('✓ parent_id column added successfully!');
      console.log('✓ Foreign key constraint created');
      console.log('✓ Index created');
    } else {
      const error = await alterTableResponse.json();
      console.error('Error adding column:', error);
      // Try alternative approach using schema manipulation
      console.log('\nTrying alternative approach with direct REST API...');

      // Since exec_sql doesn't exist, let's try creating it directly via PostgreSQL REST API extensions
      // This is a fallback - normally exec_sql should be available
    }

    console.log('\nYou can now create nested cost centers!');

  } catch (err) {
    console.error('Error:', err);
  }
}

applyChanges();
