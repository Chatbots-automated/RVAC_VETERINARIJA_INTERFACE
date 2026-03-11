const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  console.log('=== Applying Withdrawal Calculation Trigger ===\n');

  // Step 1: Create trigger function
  console.log('1. Creating trigger function...');
  const { error: err1 } = await supabase.rpc('exec_sql', {
    sql: `
      CREATE OR REPLACE FUNCTION trigger_calculate_withdrawal_on_usage()
      RETURNS TRIGGER
      SECURITY DEFINER
      SET search_path = public
      LANGUAGE plpgsql
      AS $$
      BEGIN
        PERFORM calculate_withdrawal_dates(NEW.treatment_id);
        RETURN NEW;
      END;
      $$;
    `
  });

  if (err1) {
    console.log('   Error:', err1.message);
    return;
  }
  console.log('   ✓ Done\n');

  // Step 2: Drop existing triggers
  console.log('2. Dropping old triggers (if any)...');
  await supabase.rpc('exec_sql', {
    sql: 'DROP TRIGGER IF EXISTS auto_calculate_withdrawal_on_usage ON usage_items;'
  });
  await supabase.rpc('exec_sql', {
    sql: 'DROP TRIGGER IF EXISTS auto_calculate_withdrawal_on_course ON treatment_courses;'
  });
  console.log('   ✓ Done\n');

  // Step 3: Create trigger on usage_items
  console.log('3. Creating trigger on usage_items...');
  const { error: err3 } = await supabase.rpc('exec_sql', {
    sql: `
      CREATE TRIGGER auto_calculate_withdrawal_on_usage
        AFTER INSERT OR UPDATE ON usage_items
        FOR EACH ROW
        WHEN (NEW.treatment_id IS NOT NULL)
        EXECUTE FUNCTION trigger_calculate_withdrawal_on_usage();
    `
  });

  if (err3) {
    console.log('   Error:', err3.message);
    return;
  }
  console.log('   ✓ Done\n');

  // Step 4: Create trigger on treatment_courses
  console.log('4. Creating trigger on treatment_courses...');
  const { error: err4 } = await supabase.rpc('exec_sql', {
    sql: `
      CREATE TRIGGER auto_calculate_withdrawal_on_course
        AFTER INSERT OR UPDATE ON treatment_courses
        FOR EACH ROW
        WHEN (NEW.treatment_id IS NOT NULL)
        EXECUTE FUNCTION trigger_calculate_withdrawal_on_usage();
    `
  });

  if (err4) {
    console.log('   Error:', err4.message);
    return;
  }
  console.log('   ✓ Done\n');

  // Step 5: Recalculate existing treatments
  console.log('5. Recalculating existing treatments with NULL withdrawal dates...');

  const { data: nullTreatments } = await supabase
    .from('treatments')
    .select('id')
    .or('withdrawal_until_milk.is.null,withdrawal_until_meat.is.null');

  console.log(`   Found ${nullTreatments?.length || 0} treatments to fix`);

  if (nullTreatments && nullTreatments.length > 0) {
    let fixed = 0;
    for (const t of nullTreatments) {
      await supabase.rpc('calculate_withdrawal_dates', { p_treatment_id: t.id });
      fixed++;
      if (fixed % 10 === 0) {
        console.log(`   Processed ${fixed}/${nullTreatments.length}...`);
      }
    }
    console.log(`   ✓ Fixed ${fixed} treatments\n`);
  } else {
    console.log('   ✓ No treatments need fixing\n');
  }

  console.log('\n=== SUCCESS! ===');
  console.log('Withdrawal dates will now be calculated automatically for all new treatments!');
})();
