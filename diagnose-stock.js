import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function diagnoseStock() {
  console.log('🔍 Diagnosing BioBos RCC stock discrepancy...\n');

  // Find the BioBos product
  const { data: products } = await supabase
    .from('products')
    .select('id, name')
    .ilike('name', '%BioBos RCC%');

  if (!products || products.length === 0) {
    console.log('❌ BioBos RCC product not found');
    return;
  }

  const product = products[0];
  console.log(`📦 Product: ${product.name} (${product.id})\n`);

  // Get received stock
  const { data: received } = await supabase
    .from('atsargos')
    .select('qty')
    .eq('product_id', product.id);

  const totalReceived = received?.reduce((sum, r) => sum + Number(r.qty), 0) || 0;
  console.log(`📥 Total Received: ${totalReceived} ml`);

  // Get usage from usage_items (treatments only currently)
  const { data: usageItems } = await supabase
    .from('usage_items')
    .select('qty, purpose, vaccination_id')
    .eq('product_id', product.id);

  const treatmentUsage = usageItems?.filter(u => !u.vaccination_id).reduce((sum, u) => sum + Number(u.qty), 0) || 0;
  const vaccinationUsage = usageItems?.filter(u => u.vaccination_id).reduce((sum, u) => sum + Number(u.qty), 0) || 0;

  console.log(`💉 Treatment usage: ${treatmentUsage} ml`);
  console.log(`💉 Vaccination usage (in usage_items): ${vaccinationUsage} ml`);

  // Get vaccinations NOT in usage_items
  const { data: vaccinations } = await supabase
    .from('vaccinations')
    .select('dose_amount, batch_id')
    .eq('product_id', product.id)
    .not('batch_id', 'is', null)
    .not('dose_amount', 'is', null)
    .gt('dose_amount', 0);

  // Check which vaccinations are missing from usage_items
  const { data: existingUsage } = await supabase
    .from('usage_items')
    .select('vaccination_id')
    .eq('product_id', product.id)
    .not('vaccination_id', 'is', null);

  const existingVaccinationIds = new Set(existingUsage?.map(u => u.vaccination_id) || []);
  const missingVaccinations = vaccinations?.filter(v => !existingVaccinationIds.has(v.id)) || [];

  const missingUsage = missingVaccinations.reduce((sum, v) => sum + Number(v.dose_amount), 0);

  console.log(`⚠️  Missing vaccination usage: ${missingUsage} ml (${missingVaccinations.length} vaccinations)`);

  const atsargosCalculation = totalReceived - treatmentUsage - vaccinationUsage;
  const correctStock = totalReceived - treatmentUsage - vaccinationUsage - missingUsage;

  console.log(`\n📊 CALCULATIONS:`);
  console.log(`   Atsargos tab shows: ${atsargosCalculation} ml (WRONG - missing ${missingVaccinations.length} vaccinations)`);
  console.log(`   Correct stock should be: ${correctStock} ml`);
  console.log(`   Discrepancy: ${missingUsage} ml\n`);

  // Check if vaccination_id column exists
  const { data: columns } = await supabase
    .from('information_schema.columns')
    .select('column_name')
    .eq('table_name', 'usage_items')
    .eq('column_name', 'vaccination_id');

  const migrationApplied = columns && columns.length > 0;

  console.log(`📋 Migration Status:`);
  console.log(`   vaccination_id column exists: ${migrationApplied ? '✅ YES' : '❌ NO'}`);

  if (!migrationApplied) {
    console.log(`\n⚠️  MIGRATION NOT APPLIED YET!`);
    console.log(`   The fix-vaccination-backfill.sql needs to be run in Supabase Dashboard`);
  } else {
    console.log(`\n✅ Migration column exists, but backfill may not have run`);
    console.log(`   ${missingVaccinations.length} vaccinations need to be added to usage_items`);
  }

  // Show all products with potential issues
  console.log(`\n\n🔍 Checking ALL products for vaccination discrepancies...\n`);

  const { data: allProducts } = await supabase
    .from('products')
    .select('id, name')
    .in('category', ['Vakcinai', 'Vaccines']);

  for (const prod of allProducts || []) {
    const { data: vacs } = await supabase
      .from('vaccinations')
      .select('id, dose_amount')
      .eq('product_id', prod.id)
      .not('batch_id', 'is', null)
      .not('dose_amount', 'is', null)
      .gt('dose_amount', 0);

    const { data: usage } = await supabase
      .from('usage_items')
      .select('vaccination_id')
      .eq('product_id', prod.id)
      .not('vaccination_id', 'is', null);

    const usageIds = new Set(usage?.map(u => u.vaccination_id) || []);
    const missing = vacs?.filter(v => !usageIds.has(v.id)) || [];
    const missingQty = missing.reduce((sum, v) => sum + Number(v.dose_amount), 0);

    if (missing.length > 0) {
      console.log(`   ${prod.name}: ${missing.length} vaccinations missing (${missingQty} units)`);
    }
  }
}

diagnoseStock().catch(console.error);
