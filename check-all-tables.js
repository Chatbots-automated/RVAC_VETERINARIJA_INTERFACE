import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function checkAllTables() {
  console.log('🔍 Querying actual database schema...\n');

  // Get all tables
  const { data: tables, error } = await supabase
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public')
    .eq('table_type', 'BASE TABLE');

  if (error) {
    console.log('Cannot query schema via REST, trying alternative...');

    // Try getting a list by attempting to query common tables
    const commonTables = [
      'treatments', 'animals', 'products', 'diseases',
      'usage_items', 'treatment_courses',
      'visits', 'animal_visits', 'vet_visits',
      'visit_medications', 'visit_meds',
      'treatment_medications', 'medication_records'
    ];

    console.log('Checking which tables exist:\n');

    for (const table of commonTables) {
      const { error } = await supabase
        .from(table)
        .select('id')
        .limit(1);

      if (!error) {
        console.log(`  ✅ ${table} EXISTS`);

        // Get columns for existing table
        const { data: sample } = await supabase
          .from(table)
          .select('*')
          .limit(1);

        if (sample && sample.length > 0) {
          console.log(`     Columns: ${Object.keys(sample[0]).join(', ')}`);
        }
      } else {
        console.log(`  ❌ ${table} does not exist`);
      }
    }
  }

  // Now check one of the empty treatments to see where data might be
  console.log('\n\n🔬 Checking where medication data for empty treatments might be:\n');

  const { data: emptyTreatment } = await supabase
    .from('treatments')
    .select('*')
    .eq('reg_date', '2025-12-27')
    .limit(1)
    .single();

  if (emptyTreatment) {
    console.log(`Treatment ID: ${emptyTreatment.id}`);
    console.log(`Animal ID: ${emptyTreatment.animal_id}`);
    console.log(`Date: ${emptyTreatment.reg_date}`);
    console.log(`All columns: ${Object.keys(emptyTreatment).join(', ')}\n`);

    // Check for related records
    const { data: usageItems } = await supabase
      .from('usage_items')
      .select('*')
      .eq('treatment_id', emptyTreatment.id);

    console.log(`Usage items: ${usageItems?.length || 0}`);

    const { data: courses } = await supabase
      .from('treatment_courses')
      .select('*')
      .eq('treatment_id', emptyTreatment.id);

    console.log(`Treatment courses: ${courses?.length || 0}`);
  }
}

checkAllTables().catch(console.error);
