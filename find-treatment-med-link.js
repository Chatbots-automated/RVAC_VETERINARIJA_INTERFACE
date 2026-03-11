import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function findTreatmentMedLink() {
  console.log('🔬 Finding how treatments link to medications...\n');

  // Check what treatment_id in usage_items actually references
  const { data: usageWithTreatment } = await supabase
    .from('usage_items')
    .select('*')
    .not('treatment_id', 'is', null)
    .limit(5);

  console.log(`Sample usage_items with treatment_id:\n`);
  if (usageWithTreatment && usageWithTreatment.length > 0) {
    console.log(JSON.stringify(usageWithTreatment[0], null, 2));

    // Try to find what this treatment_id points to
    const treatmentId = usageWithTreatment[0].treatment_id;

    console.log(`\n\nLooking for treatment_id ${treatmentId} in different tables...\n`);

    // Check treatments table
    const { data: inTreatments } = await supabase
      .from('treatments')
      .select('*')
      .eq('id', treatmentId)
      .maybeSingle();

    console.log(`In 'treatments' table: ${inTreatments ? '✅ FOUND' : '❌ NOT FOUND'}`);
    if (inTreatments) {
      console.log('  Has product_id?', 'product_id' in inTreatments);
      console.log('  Columns:', Object.keys(inTreatments).join(', '));
    }

    // Check if there's a visit_medications table
    const { data: tableList, error } = await supabase
      .rpc('exec_sql', {
        query: `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
      });

    if (!error && tableList) {
      console.log('\n\nPublic tables:');
      tableList.forEach(t => console.log(`   ${t.table_name}`));
    }
  }

  // Let's try to understand the structure better
  console.log(`\n\n🔍 Checking for medication-related tables...\n`);

  // Try common table names
  const tablesToTry = [
    'visit_medications',
    'treatment_medications',
    'medication_uses',
    'treatment_items'
  ];

  for (const tableName of tablesToTry) {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .limit(1);

    if (!error && data) {
      console.log(`✅ Found table: ${tableName}`);
      if (data.length > 0) {
        console.log(`   Columns: ${Object.keys(data[0]).join(', ')}`);
      }
    }
  }

  // Check what tables have a column that could link to products
  console.log(`\n\n🔍 Tables with product_id column:\n`);

  const tablesWithProduct = ['usage_items', 'atsargos', 'batches', 'vaccinations'];

  for (const table of tablesWithProduct) {
    const { count } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
      .not('product_id', 'is', null);

    console.log(`   ${table}: ${count} records with product_id`);
  }
}

findTreatmentMedLink().catch(console.error);
