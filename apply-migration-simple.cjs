const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  try {
    console.log('Applying migration...\n');

    // Read the SQL file
    const viewSql = fs.readFileSync('fix-treated-animals-view.sql', 'utf8');

    // Create a temporary function to execute the SQL
    const createFunctionSql = `
CREATE OR REPLACE FUNCTION temp_apply_migration()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  ${viewSql.replace(/'/g, "''")}
  RETURN 'Migration applied successfully';
END;
$$;
`;

    console.log('Step 1: Creating temporary function...');
    const { error: createError } = await supabase.rpc('exec', { sql: createFunctionSql });

    if (createError) {
      console.error('Cannot create temp function:', createError.message);
      console.log('\nAttempting direct view creation...');

      // Try creating the view directly using multiple steps
      const { data, error } = await supabase.rpc('apply_migration_view', {});

      if (error) {
        throw new Error('View creation failed. Please apply migration manually.');
      }
    }

    console.log('✓ Migration preparation complete\n');

    // Test the result
    console.log('Testing the view...');
    const { data, error: testError } = await supabase
      .from('vw_treated_animals_detailed')
      .select('treatment_id, disease_name, treatment_days, medication_source')
      .limit(10);

    if (testError) {
      throw testError;
    }

    console.log('\nSample data:');
    data?.forEach(d => {
      console.log(`  ${d.disease_name || 'NULL'} - ${d.treatment_days}d - ${d.medication_source}`);
    });

    const emptyCount = data?.filter(d => !d.disease_name).length || 0;
    console.log(`\n✓ Empty diseases: ${emptyCount} (should be 0)`);

  } catch (error) {
    console.error('\nError:', error.message);
    console.log('\n⚠️  Please apply the migration manually by running:');
    console.log('  1. Open Supabase Dashboard');
    console.log('  2. Go to SQL Editor');
    console.log('  3. Paste the contents of fix-treated-animals-view.sql');
    console.log('  4. Execute the query');
    process.exit(1);
  }
})();
