import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function checkEmptyDiseases() {
  console.log('Checking treatments with empty disease\n');

  const { count: totalCount } = await supabase
    .from('treatments')
    .select('*', { count: 'exact', head: true });

  const { count: emptyCount } = await supabase
    .from('treatments')
    .select('*', { count: 'exact', head: true })
    .is('disease_id', null);

  console.log('Total treatments:', totalCount);
  console.log('Empty disease:', emptyCount);
  console.log('Percentage:', ((emptyCount / totalCount) * 100).toFixed(1) + '%\n');

  const { data: examples } = await supabase
    .from('treatments')
    .select('*, animals(tag_no)')
    .is('disease_id', null)
    .order('reg_date', { ascending: false })
    .limit(5);

  console.log('Examples:\n');
  
  for (const t of examples || []) {
    console.log('Animal:', t.animals?.tag_no, '(' + t.reg_date + ')');
    console.log('  clinical_diagnosis:', t.clinical_diagnosis || 'EMPTY');
    console.log('  animal_condition:', t.animal_condition || 'EMPTY');
    
    const { data: usageItems } = await supabase
      .from('usage_items')
      .select('*, products(name, category)')
      .eq('treatment_id', t.id);
      
    if (usageItems && usageItems.length > 0) {
      console.log('  Products:');
      usageItems.forEach(ui => {
        console.log('    -', ui.products?.name, '(' + ui.products?.category + ')');
      });
    }
    
    console.log('');
  }
}

checkEmptyDiseases().catch(console.error);
