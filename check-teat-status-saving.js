import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function checkTeatStatus() {
  console.log('\n=== CHECKING TEAT_STATUS TABLE ===\n');

  // Check recent records
  const { data: allRecords, error: allError } = await supabase
    .from('teat_status')
    .select('*')
    .order('created_at', { ascending: false, nullsFirst: false })
    .limit(20);

  if (allError) {
    console.error('Error fetching all records:', allError);
  } else {
    console.log('\nRecent teat_status records:');
    console.table(allRecords);
  }

  // Check for disabled teats
  const { data: disabledRecords, error: disabledError } = await supabase
    .from('teat_status')
    .select('*')
    .eq('is_disabled', true)
    .order('disabled_date', { ascending: false, nullsFirst: false });

  if (disabledError) {
    console.error('Error fetching disabled records:', disabledError);
  } else {
    console.log('\nCurrently disabled teats:');
    console.table(disabledRecords);
  }
}

checkTeatStatus().catch(console.error);
