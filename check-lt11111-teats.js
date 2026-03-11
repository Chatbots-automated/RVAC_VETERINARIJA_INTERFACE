import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function checkLT11111() {
  console.log('\n=== CHECKING COW LT11111 ===\n');

  // Find the cow - search by tag_no
  const { data: animals, error: animalError } = await supabase
    .from('animals')
    .select('*')
    .eq('tag_no', 'LT11111')
    .limit(5);

  if (animalError) {
    console.error('Error finding cow:', animalError);
    return;
  }

  if (!animals || animals.length === 0) {
    console.log('No cow found with LT11111');
    return;
  }

  const animal = animals[0];
  console.log('Found cow:', animal);

  // Check teat_status records
  const { data: teatStatus, error: teatError } = await supabase
    .from('teat_status')
    .select('*')
    .eq('animal_id', animal.id);

  console.log('\nAll teat_status records for LT11111:');
  console.table(teatStatus);

  // Check disabled teats
  const { data: disabledTeats, error: disabledError } = await supabase
    .from('teat_status')
    .select('*')
    .eq('animal_id', animal.id)
    .eq('is_disabled', true);

  console.log('\nDisabled teats for LT11111:');
  console.table(disabledTeats);

  // Check recent treatments
  const { data: treatments, error: treatmentsError } = await supabase
    .from('treatments')
    .select('id, reg_date, sick_teats, disabled_teats, affected_teats')
    .eq('animal_id', animal.id)
    .order('reg_date', { ascending: false })
    .limit(5);

  console.log('\nRecent treatments for LT11111:');
  console.table(treatments);
}

checkLT11111().catch(console.error);
