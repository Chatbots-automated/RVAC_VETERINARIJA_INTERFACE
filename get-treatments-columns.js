import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function getTreatmentsColumns() {
  console.log('🔬 Getting treatments table columns...\n');

  // Query information_schema
  const { data, error } = await supabase
    .from('information_schema.columns')
    .select('column_name, data_type, is_nullable')
    .eq('table_schema', 'public')
    .eq('table_name', 'treatments')
    .order('ordinal_position');

  if (error) {
    console.log('Error querying schema:', error);

    // Try alternative: just select all columns from a treatment
    console.log('\nTrying to get columns from actual data...\n');

    const { data: treatmentData, error: treatmentError } = await supabase
      .from('treatments')
      .select('*')
      .limit(1);

    if (treatmentError) {
      console.log('Error:', treatmentError);
    } else if (treatmentData && treatmentData.length > 0) {
      const columns = Object.keys(treatmentData[0]);
      console.log(`Found ${columns.length} columns:`);
      columns.forEach(col => console.log(`   ${col}`));

      console.log('\nSample treatment:');
      console.log(JSON.stringify(treatmentData[0], null, 2));
    }
  } else {
    console.log(`Found ${data?.length || 0} columns:\n`);
    data?.forEach(col => {
      console.log(`   ${col.column_name}: ${col.data_type}`);
    });
  }

  // Now check some treatments and their usage
  console.log('\n\n🔍 Checking treatment -> usage_item mapping...\n');

  const { data: treatments } = await supabase
    .from('treatments')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  if (!treatments || treatments.length === 0) {
    console.log('No treatments found');
    return;
  }

  console.log(`Analyzing ${treatments.length} recent treatments:\n`);

  for (const treatment of treatments) {
    const { data: usageItems } = await supabase
      .from('usage_items')
      .select('qty, batch_id')
      .eq('treatment_id', treatment.id);

    const { data: product } = await supabase
      .from('products')
      .select('name, category')
      .eq('id', treatment.product_id)
      .single();

    console.log(`${product?.name || 'Unknown'} (${product?.category || 'N/A'})`);
    console.log(`   Qty: ${treatment.qty || 'N/A'}, Batch: ${treatment.batch_id ? 'YES' : 'NO'}`);
    console.log(`   Date: ${treatment.treatment_date || treatment.created_at?.substring(0, 10)}`);
    console.log(`   Usage items: ${usageItems && usageItems.length > 0 ? '✅ YES' : '❌ NO'}`);
    console.log('');
  }
}

getTreatmentsColumns().catch(console.error);
