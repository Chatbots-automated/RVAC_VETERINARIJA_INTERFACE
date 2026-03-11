const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

async function applyMigration() {
  console.log('🚀 Applying milk tests linking migration...\n');

  const migrationSQL = fs.readFileSync(
    path.join(__dirname, 'link-milk-tests-to-weights-migration.sql'),
    'utf8'
  );

  try {
    // Execute the migration SQL
    const { data, error } = await supabase.rpc('exec_sql', { sql: migrationSQL });

    if (error) {
      // If exec_sql doesn't exist, try executing statements one by one
      console.log('Note: exec_sql not available, executing via direct SQL...\n');

      // Split and execute
      const statements = migrationSQL
        .split(/;\s*$/gm)
        .filter(s => s.trim().length > 0)
        .map(s => s.trim() + ';');

      for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i];
        if (stmt.includes('--') || stmt.trim() === '') continue;

        console.log(`Executing statement ${i + 1}/${statements.length}...`);

        // We need to use a different approach - let's just read the file
        // and apply it manually via Supabase Dashboard
        console.error('\n❌ Cannot execute SQL directly via API.');
        console.log('\n📋 Please apply the migration manually:');
        console.log('\n1. Go to: https://supabase.com/dashboard/project/olxnahsxvyiadknybagt/sql/new');
        console.log('2. Copy contents from: link-milk-tests-to-weights-migration.sql');
        console.log('3. Paste and click RUN\n');
        return;
      }
    } else {
      console.log('✅ Migration executed successfully!');
      console.log('Result:', data);
    }

    // Verify the migration
    console.log('\n📊 Verifying migration...\n');

    const { data: compTests } = await supabase
      .from('milk_composition_tests')
      .select('id, milk_weight_id')
      .not('milk_weight_id', 'is', null)
      .limit(5);

    const { data: qualTests } = await supabase
      .from('milk_quality_tests')
      .select('id, milk_weight_id')
      .not('milk_weight_id', 'is', null)
      .limit(5);

    console.log(`✅ Composition tests linked: ${compTests?.length || 0} samples found`);
    console.log(`✅ Quality tests linked: ${qualTests?.length || 0} samples found`);

    // Test the view
    const { data: combined, error: viewError } = await supabase
      .from('milk_data_combined')
      .select('*')
      .limit(1);

    if (!viewError && combined) {
      console.log('\n✅ Combined view created successfully!');
      console.log(`Sample record:`, JSON.stringify(combined[0], null, 2));
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.log('\n📋 Please apply the migration manually:');
    console.log('\n1. Go to: https://supabase.com/dashboard/project/olxnahsxvyiadknybagt/sql/new');
    console.log('2. Copy contents from: link-milk-tests-to-weights-migration.sql');
    console.log('3. Paste and click RUN\n');
  }
}

applyMigration();
