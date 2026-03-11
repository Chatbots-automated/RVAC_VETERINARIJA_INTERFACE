import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

async function addCategories() {
  console.log('Adding equipment categories...\n');

  const categories = [
    { name: 'Įrankiai', description: 'Darbo įrankiai' },
    { name: 'Drabužiai', description: 'Drabužiai ir APĮ' },
    { name: 'Transportas', description: 'Transporto priemonės ir dalys' },
    { name: 'Atsarginės dalys', description: 'Įrangos ir transporto atsarginės dalys' },
    { name: 'Kuro produktai', description: 'Degalai ir tepalai' },
    { name: 'Kita įranga', description: 'Kita įranga ir reikmenys' }
  ];

  for (const category of categories) {
    const { data, error } = await supabase
      .from('equipment_categories')
      .upsert(category, { onConflict: 'name', ignoreDuplicates: true })
      .select();

    if (error) {
      console.error(`Error adding ${category.name}:`, error.message);
    } else {
      console.log(`✓ Added category: ${category.name}`);
    }
  }

  console.log('\nFetching all categories...');
  const { data: allCategories } = await supabase
    .from('equipment_categories')
    .select('*')
    .order('name');

  if (allCategories) {
    console.log('\nAll categories:');
    allCategories.forEach(cat => {
      console.log(`  - ${cat.name}: ${cat.description} (ID: ${cat.id})`);
    });
  }
}

addCategories();
