const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  console.log('=== Testing Withdrawal Calculation Fix ===\n');

  // Read and execute the SQL fix
  const sql = fs.readFileSync('fix-withdrawal-calculation-trigger.sql', 'utf8');

  console.log('Applying SQL fix...');

  // Split by semicolons and execute each statement
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('--') && s.length > 0);

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    if (!stmt || stmt.length < 10) continue;

    try {
      const { data, error } = await supabase.rpc('exec_sql', { sql: stmt + ';' });

      if (error) {
        console.log(`Statement ${i + 1} error:`, error.message);
      } else if (data && Array.isArray(data) && data.length > 0) {
        console.log(`✓ ${data[0].status || 'Done'}`);
      }
    } catch (e) {
      console.log(`Statement ${i + 1} failed:`, e.message);
    }
  }

  console.log('\n--- Checking collar 131 again ---\n');

  // Find collar 131
  const { data: collar } = await supabase
    .from('vw_animal_latest_collar')
    .select('animal_id, collar_no')
    .eq('collar_no', 131)
    .maybeSingle();

  if (!collar) {
    console.log('Could not find collar 131');
    return;
  }

  // Get the treatment
  const { data: treatment } = await supabase
    .from('treatments')
    .select(`
      *,
      usage_items (
        product:products (name, withdrawal_days_meat, withdrawal_days_milk)
      )
    `)
    .eq('animal_id', collar.animal_id)
    .order('reg_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!treatment) {
    console.log('No treatment found');
    return;
  }

  console.log(`Treatment Date: ${treatment.reg_date}`);
  console.log(`Withdrawal until meat: ${treatment.withdrawal_until_meat}`);
  console.log(`Withdrawal until milk: ${treatment.withdrawal_until_milk}`);
  console.log('\nMedications:');

  treatment.usage_items?.forEach(ui => {
    console.log(`  - ${ui.product.name}`);
    console.log(`    Meat: ${ui.product.withdrawal_days_meat} days`);
    console.log(`    Milk: ${ui.product.withdrawal_days_milk} days`);
  });

  const today = new Date().toISOString().split('T')[0];
  console.log(`\n Today: ${today}`);

  if (treatment.withdrawal_until_meat) {
    console.log(`✓ Meat withdrawal: ${treatment.withdrawal_until_meat >= today ? 'ACTIVE' : 'Expired'}`);
  }

  if (treatment.withdrawal_until_milk) {
    console.log(`✓ Milk withdrawal: ${treatment.withdrawal_until_milk >= today ? 'ACTIVE' : 'Expired'}`);
  }
})();
