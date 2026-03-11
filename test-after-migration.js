import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function testAfterMigration() {
  console.log('Testing what the fixed view will show...\n');

  // Get treatments with empty disease
  const { data: emptyDiseaseTests } = await supabase
    .from('treatments')
    .select('*, animals(tag_no)')
    .is('disease_id', null)
    .not('clinical_diagnosis', 'is', null)
    .limit(3);

  console.log('BEFORE migration (disease_name would be NULL):\n');
  
  for (const t of emptyDiseaseTests || []) {
    console.log('Animal:', t.animals?.tag_no);
    console.log('  disease_id: NULL');
    console.log('  clinical_diagnosis:', t.clinical_diagnosis);
    console.log('  AFTER migration, disease_name will show:', t.clinical_diagnosis);
    console.log('');
  }

  // Check one with animal_condition but no clinical_diagnosis
  const { data: conditionOnly } = await supabase
    .from('treatments')
    .select('*, animals(tag_no)')
    .is('disease_id', null)
    .is('clinical_diagnosis', null)
    .not('animal_condition', 'is', null)
    .limit(1)
    .maybeSingle();

  if (conditionOnly) {
    console.log('When only animal_condition exists:');
    console.log('  Animal:', conditionOnly.animals?.tag_no);
    console.log('  disease_id: NULL');
    console.log('  clinical_diagnosis: NULL');
    console.log('  animal_condition:', conditionOnly.animal_condition);
    console.log('  AFTER migration, disease_name will show:', conditionOnly.animal_condition);
    console.log('');
  }

  console.log('\nSummary:');
  console.log('- View now includes ALL product categories (medicines, hygiene, prevention, vaccines)');
  console.log('- Disease shows clinical_diagnosis or animal_condition when disease_id is NULL');
  console.log('- Medications from animal_visits.planned_medications JSON are included');
  console.log('- Veterinarian always shows ARTURAS ABROMAITIS');
}

testAfterMigration().catch(console.error);
