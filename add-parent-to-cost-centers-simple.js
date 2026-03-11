import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function addParentColumn() {
  console.log('Adding parent_id column to cost_centers...\n');

  try {
    // Try to select with parent_id to see if column exists
    const { error: testError } = await supabase
      .from('cost_centers')
      .select('parent_id')
      .limit(1);

    if (!testError) {
      console.log('✓ parent_id column already exists!');
      return;
    }

    console.log('Column does not exist. Please add it manually in Supabase SQL Editor:');
    console.log('\nRun this SQL:');
    console.log('------------------------------------------');
    console.log(`
ALTER TABLE cost_centers
ADD COLUMN parent_id uuid REFERENCES cost_centers(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_cost_centers_parent_id ON cost_centers(parent_id);
    `.trim());
    console.log('------------------------------------------\n');
    console.log('Instructions:');
    console.log('1. Go to your Supabase Dashboard');
    console.log('2. Navigate to SQL Editor');
    console.log('3. Paste the SQL above');
    console.log('4. Click "Run"');
    console.log('\nAfter running, you can create nested cost centers!');

  } catch (err) {
    console.error('Error:', err);
  }
}

addParentColumn();
