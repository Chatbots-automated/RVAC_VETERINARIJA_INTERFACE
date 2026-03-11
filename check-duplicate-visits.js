import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function checkDuplicateVisits() {
  console.log('\n🔍 Checking for duplicate visits TODAY...\n');

  const today = new Date().toISOString().split('T')[0];
  console.log('Today:', today);

  // Get all visits for today
  const { data: visits, error } = await supabase
    .from('animal_visits')
    .select(`
      id,
      animal_id,
      visit_datetime,
      procedures,
      status,
      notes,
      sync_step_id,
      related_visit_id,
      created_at
    `)
    .gte('visit_datetime', `${today}T00:00:00`)
    .lte('visit_datetime', `${today}T23:59:59`)
    .order('animal_id')
    .order('created_at');

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`\nTotal visits today: ${visits.length}\n`);

  // Group by animal_id
  const byAnimal = {};
  visits.forEach(visit => {
    if (!byAnimal[visit.animal_id]) {
      byAnimal[visit.animal_id] = [];
    }
    byAnimal[visit.animal_id].push(visit);
  });

  // Find animals with duplicate visits
  let duplicatesFound = 0;

  for (const [animalId, animalVisits] of Object.entries(byAnimal)) {
    if (animalVisits.length > 1) {
      duplicatesFound++;
      console.log(`\n🐄 Animal ${animalId} has ${animalVisits.length} visits today:`);

      animalVisits.forEach((visit, idx) => {
        console.log(`\n  Visit ${idx + 1}:`);
        console.log(`    ID: ${visit.id}`);
        console.log(`    Created at: ${visit.created_at}`);
        console.log(`    Datetime: ${visit.visit_datetime}`);
        console.log(`    Status: ${visit.status}`);
        console.log(`    Procedures: ${visit.procedures.join(', ')}`);
        console.log(`    Sync step ID: ${visit.sync_step_id || 'N/A'}`);
        console.log(`    Related visit ID: ${visit.related_visit_id || 'N/A'}`);
        console.log(`    Notes: ${(visit.notes || '').substring(0, 100)}...`);
      });

      console.log('\n  ---');
    }
  }

  if (duplicatesFound === 0) {
    console.log('\n✅ No duplicate visits found for today!');
  } else {
    console.log(`\n\n⚠️  Found ${duplicatesFound} animals with duplicate visits today`);
  }

  // Check for visits with the same animal_id, procedures, and timestamp within 1 minute
  console.log('\n\n🔍 Checking for exact duplicates (same animal, procedures, and close timestamps)...\n');

  let exactDuplicates = 0;

  for (const [animalId, animalVisits] of Object.entries(byAnimal)) {
    for (let i = 0; i < animalVisits.length; i++) {
      for (let j = i + 1; j < animalVisits.length; j++) {
        const v1 = animalVisits[i];
        const v2 = animalVisits[j];

        const proceduresMatch = JSON.stringify(v1.procedures.sort()) === JSON.stringify(v2.procedures.sort());
        const t1 = new Date(v1.visit_datetime).getTime();
        const t2 = new Date(v2.visit_datetime).getTime();
        const timeDiffMinutes = Math.abs(t1 - t2) / 1000 / 60;

        if (proceduresMatch && timeDiffMinutes < 5) {
          exactDuplicates++;
          console.log(`\n❌ EXACT DUPLICATE FOUND for animal ${animalId}:`);
          console.log(`   Visit 1: ${v1.id} (created ${v1.created_at})`);
          console.log(`   Visit 2: ${v2.id} (created ${v2.created_at})`);
          console.log(`   Procedures: ${v1.procedures.join(', ')}`);
          console.log(`   Time difference: ${timeDiffMinutes.toFixed(2)} minutes`);
        }
      }
    }
  }

  if (exactDuplicates === 0) {
    console.log('✅ No exact duplicates found!');
  } else {
    console.log(`\n\n⚠️  Found ${exactDuplicates} exact duplicate visit pairs`);
  }
}

checkDuplicateVisits();
