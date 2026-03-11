import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function applyFix() {
  console.log('=== Applying Withdrawal Calculation Fix ===\n');

  // Read the SQL file
  const sql = readFileSync('/tmp/fix_withdrawal_max_not_sum.sql', 'utf8');

  // Split into individual statements and execute
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('/*') && !s.startsWith('--'));

  console.log(`Executing ${statements.length} SQL statements...\n`);

  // Execute each statement
  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i] + ';';

    // Skip comments-only statements
    if (statement.trim().startsWith('/*') || statement.trim().startsWith('--')) {
      continue;
    }

    try {
      const { error } = await supabase.rpc('exec_sql', { query: statement });

      if (error && error.code !== 'PGRST202') {
        // If exec_sql doesn't exist, try direct execution
        const { error: directError } = await supabase.from('_exec').insert({ sql: statement });
        if (directError) {
          console.error(`Error on statement ${i + 1}:`, error.message || directError.message);
        }
      }
    } catch (err) {
      console.error(`Exception on statement ${i + 1}:`, err.message);
    }
  }

  console.log('\n✓ Migration statements executed\n');

  // Verify the fix for the example treatment
  console.log('Verifying fix for cow LT000008564406...\n');

  const { data: treatment } = await supabase
    .from('treatments')
    .select('id, reg_date, withdrawal_until_milk, withdrawal_until_meat')
    .eq('animal_id', '051cb782-120c-451d-ae23-b6f23812e9c3')
    .eq('reg_date', '2025-11-26')
    .single();

  if (treatment) {
    console.log('Treatment on 2025-11-26:');
    console.log(`  Old withdrawal: 2025-12-04`);
    console.log(`  New withdrawal: ${treatment.withdrawal_until_milk}`);
    console.log(`  Expected: 2025-12-02`);
    console.log(`  ${treatment.withdrawal_until_milk === '2025-12-02' ? '✓ FIXED!' : '✗ Still incorrect'}`);

    // Check courses
    const { data: courses } = await supabase
      .from('treatment_courses')
      .select('*')
      .eq('treatment_id', treatment.id);

    console.log(`\n  Courses remaining: ${courses?.length || 0}`);

    // Check medications
    const { data: meds } = await supabase
      .from('usage_items')
      .select('*, products(name, withdrawal_days_milk)')
      .eq('treatment_id', treatment.id);

    console.log(`  Medications: ${meds?.length || 0}`);
    if (meds) {
      meds.forEach(m => {
        console.log(`    - ${m.products.name}: ${m.products.withdrawal_days_milk}d`);
      });
    }
  }

  // Show audit summary
  console.log('\n=== Audit Summary ===\n');

  const { data: audit, error: auditError } = await supabase
    .from('withdrawal_fix_audit_20260104')
    .select('*')
    .neq('old_milk_withdrawal', 'new_milk_withdrawal');

  if (!auditError && audit) {
    console.log(`Total treatments with changed milk withdrawal: ${audit.length}`);

    const shortened = audit.filter(a => {
      const oldDate = new Date(a.old_milk_withdrawal);
      const newDate = new Date(a.new_milk_withdrawal);
      return newDate < oldDate;
    });

    console.log(`Withdrawal periods shortened: ${shortened.length}`);

    if (shortened.length > 0) {
      console.log('\nExamples of shortened withdrawals:');
      shortened.slice(0, 5).forEach(a => {
        const oldDate = new Date(a.old_milk_withdrawal);
        const newDate = new Date(a.new_milk_withdrawal);
        const diff = Math.floor((oldDate - newDate) / (1000 * 60 * 60 * 24));
        console.log(`  ${a.animal_tag} (${a.treatment_date}): ${a.old_milk_withdrawal} → ${a.new_milk_withdrawal} (-${diff} days)`);
      });
    }
  }
}

applyFix().catch(console.error);
