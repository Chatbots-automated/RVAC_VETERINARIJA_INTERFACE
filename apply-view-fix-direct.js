import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function applyViewFix() {
  console.log('🔧 Applying vw_treated_animals view fix...\n');

  const sql = fs.readFileSync('/tmp/apply_view_fix.sql', 'utf8');

  // Split by semicolon and execute each statement
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    console.log(`Executing statement ${i + 1}/${statements.length}...`);

    const { data, error } = await supabase.rpc('exec_sql', { sql: stmt });

    if (error) {
      // Try alternative approach - query directly
      console.log(`RPC failed, trying direct execution...`);

      // For views, we can try using the REST API directly
      // But this won't work for DDL statements
      console.log(`\n❌ Cannot execute DDL via REST API.`);
      console.log(`\n📋 MANUAL STEPS REQUIRED:`);
      console.log(`\n1. Open Supabase Dashboard SQL Editor:`);
      console.log(`   https://supabase.com/dashboard/project/YOUR_PROJECT/sql/new`);
      console.log(`\n2. Copy and paste the SQL from: /tmp/apply_view_fix.sql`);
      console.log(`\n3. Click "Run"`);
      console.log(`\nThe SQL creates a view that:`);
      console.log(`   - Always shows "ARTŪRAS ABROMAITIS" as veterinarian`);
      console.log(`   - Includes medications from visits`);
      console.log(`   - Calculates treatment duration from actual visits`);
      return;
    }

    console.log(`✅ Statement ${i + 1} executed`);
  }

  console.log('\n✅ View updated successfully!\n');

  // Test the fix
  const { data: testData } = await supabase
    .from('vw_treated_animals')
    .select('animal_tag, veterinarian, treatment_days, products_used')
    .limit(5);

  console.log('📊 Sample data after fix:');
  testData?.forEach(row => {
    console.log(`\n  ${row.animal_tag}:`);
    console.log(`    Vet: ${row.veterinarian}`);
    console.log(`    Days: ${row.treatment_days}`);
    console.log(`    Meds: ${row.products_used || 'none'}`);
  });
}

applyViewFix().catch(console.error);
