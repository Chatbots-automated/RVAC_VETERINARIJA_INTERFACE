import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function diagnoseMilkAverage() {
  console.log('Diagnosing Milk Average for LT000009135825\n');
  console.log('==============================================\n');

  const testTag = 'LT000009135825';

  // Get animal ID
  const { data: animal } = await supabase
    .from('animals')
    .select('id, tag_no')
    .eq('tag_no', testTag)
    .single();

  if (!animal) {
    console.error('Animal not found');
    return;
  }

  console.log(`Animal: ${animal.tag_no} (${animal.id})\n`);

  // Get recent GEA data
  const { data: geaData } = await supabase
    .from('gea_daily')
    .select('snapshot_date, milk_avg')
    .eq('animal_id', animal.id)
    .order('snapshot_date', { ascending: false })
    .limit(10);

  console.log('GEA Daily Data (Last 10 days):');
  console.log('================================');
  geaData?.forEach(day => {
    console.log(`${day.snapshot_date}: ${day.milk_avg} kg/day`);
  });

  const latestMilkAvg = geaData?.[0]?.milk_avg || 0;
  console.log(`\n>>> Latest milk_avg: ${latestMilkAvg} kg/day <<<\n`);

  // Get active synchronizations
  const { data: syncs } = await supabase
    .from('animal_synchronizations')
    .select('id, start_date, status')
    .eq('animal_id', animal.id)
    .in('status', ['Active', 'Completed'])
    .order('start_date', { ascending: false })
    .limit(1);

  if (syncs && syncs.length > 0) {
    console.log('\nActive Synchronization:');
    console.log('=======================');
    const sync = syncs[0];
    console.log(`Sync ID: ${sync.id}`);
    console.log(`Start Date: ${sync.start_date}`);
    console.log(`Status: ${sync.status}`);

    // Test what calculate_average_daily_milk returns for this sync start date
    const { data: avgMilk, error: avgError } = await supabase
      .rpc('calculate_average_daily_milk', {
        p_animal_id: animal.id,
        p_before_date: sync.start_date
      });

    if (avgError) {
      console.error('Error calling function:', avgError);
    } else {
      console.log(`\ncalculate_average_daily_milk(before ${sync.start_date}): ${avgMilk} kg/day`);

      // Check what milk_avg was on the day before sync start
      const dayBefore = new Date(sync.start_date);
      dayBefore.setDate(dayBefore.getDate() - 1);
      const dayBeforeStr = dayBefore.toISOString().split('T')[0];

      const { data: milkAvgBefore } = await supabase
        .from('gea_daily')
        .select('snapshot_date, milk_avg')
        .eq('animal_id', animal.id)
        .lte('snapshot_date', dayBeforeStr)
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .single();

      if (milkAvgBefore) {
        console.log(`Actual milk_avg on ${milkAvgBefore.snapshot_date}: ${milkAvgBefore.milk_avg} kg/day`);
      }
    }
  }

  // Get recent treatments with withdrawal
  const { data: treatments } = await supabase
    .from('treatments')
    .select('id, reg_date, withdrawal_until_milk')
    .eq('animal_id', animal.id)
    .not('withdrawal_until_milk', 'is', null)
    .order('reg_date', { ascending: false })
    .limit(1);

  if (treatments && treatments.length > 0) {
    console.log('\n\nRecent Treatment with Withdrawal:');
    console.log('=================================');
    const treatment = treatments[0];
    console.log(`Treatment ID: ${treatment.id}`);
    console.log(`Treatment Date: ${treatment.reg_date}`);
    console.log(`Withdrawal Until: ${treatment.withdrawal_until_milk}`);

    // Test what get_animal_avg_milk_at_date returns for this treatment date
    const { data: avgMilkAtDate, error: atDateError } = await supabase
      .rpc('get_animal_avg_milk_at_date', {
        p_animal_id: animal.id,
        p_date: treatment.reg_date
      });

    if (atDateError) {
      console.error('Error calling function:', atDateError);
    } else {
      console.log(`\nget_animal_avg_milk_at_date(at ${treatment.reg_date}): ${avgMilkAtDate} kg/day`);

      // Check what milk_avg was on or before treatment date
      const { data: milkAvgAtDate } = await supabase
        .from('gea_daily')
        .select('snapshot_date, milk_avg')
        .eq('animal_id', animal.id)
        .lte('snapshot_date', treatment.reg_date)
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .single();

      if (milkAvgAtDate) {
        console.log(`Actual milk_avg on ${milkAvgAtDate.snapshot_date}: ${milkAvgAtDate.milk_avg} kg/day`);
      }
    }
  }

  console.log('\n==============================================');
  console.log('ANALYSIS:');
  console.log('==============================================');
  console.log('All sections should use the latest milk_avg directly.');
  console.log('If values differ, it means:');
  console.log('1. The fix-milk-loss-7day-actual.sql has NOT been applied yet');
  console.log('2. OR functions are using milk_avg from different dates');
  console.log('3. OR there is another calculation happening somewhere');
}

diagnoseMilkAverage();
