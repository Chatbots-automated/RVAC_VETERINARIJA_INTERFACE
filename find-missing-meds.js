import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function findMissingMeds() {
  console.log('🔍 Looking for medications that exist but aren\'t showing...\n');

  // Check one of the "empty" animals
  const animalTag = 'LT000044228079';

  const { data: animal } = await supabase
    .from('animals')
    .select('id')
    .eq('tag_no', animalTag)
    .single();

  if (!animal) {
    console.log('Animal not found');
    return;
  }

  console.log(`Checking animal ${animalTag} (${animal.id.substring(0, 8)})\n`);

  // Check ALL visits for this animal
  const { data: allVisits } = await supabase
    .from('visits')
    .select('*, visit_medications(*, products(name))')
    .eq('animal_id', animal.id)
    .order('visit_date', { ascending: false })
    .limit(20);

  console.log(`All visits: ${allVisits?.length || 0}\n`);
  allVisits?.forEach(v => {
    console.log(`  📅 ${v.visit_date} - ${v.visit_medications?.length || 0} medications`);
    v.visit_medications?.forEach(vm => {
      console.log(`     - ${vm.products?.name}: ${vm.quantity} ${vm.unit}`);
    });
  });

  // Check treatments
  const { data: treatments } = await supabase
    .from('treatments')
    .select('*, usage_items(*, products(name))')
    .eq('animal_id', animal.id)
    .order('reg_date', { ascending: false })
    .limit(10);

  console.log(`\nTreatments: ${treatments?.length || 0}\n`);
  treatments?.forEach(t => {
    console.log(`  💊 ${t.reg_date} - Disease: ${t.disease_id?.substring(0, 8) || 'none'}`);
    console.log(`     Usage items: ${t.usage_items?.length || 0}`);
    t.usage_items?.forEach(ui => {
      console.log(`     - ${ui.products?.name}: ${ui.qty} ${ui.unit}`);
    });
  });

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('💡 KEY INSIGHT:');
  console.log('If visits have medications but treatments don\'t have usage_items,');
  console.log('then we need to JOIN with visits to show medication data!\n');
}

findMissingMeds().catch(console.error);
