import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function checkAllTreatments() {
  console.log('=== CHECKING MULTIPLE ANIMALS FOR MISSING WITHDRAWAL DATES ===\n');

  const collars = [484, 541, 72, 15, 131];

  for (const collarNo of collars) {
    const { data: collar } = await supabase
      .from('vw_animal_latest_collar')
      .select('animal_id')
      .eq('collar_no', collarNo)
      .maybeSingle();

    if (!collar) {
      console.log(`Collar ${collarNo} - NOT FOUND\n`);
      continue;
    }

    const { data: treatments } = await supabase
      .from('treatments')
      .select('id, reg_date, withdrawal_until_meat, withdrawal_until_milk')
      .eq('animal_id', collar.animal_id)
      .order('reg_date', { ascending: false })
      .limit(5);

    const withNull = treatments?.filter(t =>
      t.withdrawal_until_meat === null || t.withdrawal_until_milk === null
    );

    console.log(`Collar ${collarNo}`);
    console.log(`  Total recent treatments: ${treatments?.length || 0}`);
    console.log(`  Missing withdrawal dates: ${withNull?.length || 0}`);

    if (withNull && withNull.length > 0) {
      console.log('  Treatments with NULL withdrawal:');
      for (const t of withNull) {
        console.log(`    - ${t.reg_date} (ID: ${t.id})`);
      }
    }
    console.log('');
  }
}

checkAllTreatments().catch(console.error);
