import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
  {
    db: { schema: 'public' }
  }
);

async function checkMigrationStatus() {
  console.log('🔍 Checking migration status...\n');

  // Method 1: Try to query usage_items with vaccination_id
  try {
    const { data, error } = await supabase
      .from('usage_items')
      .select('vaccination_id')
      .limit(1);

    if (error) {
      console.log('❌ vaccination_id column does NOT exist');
      console.log(`   Error: ${error.message}\n`);
    } else {
      console.log('✅ vaccination_id column EXISTS');

      // Count how many usage_items have vaccination_id
      const { count } = await supabase
        .from('usage_items')
        .select('*', { count: 'exact', head: true })
        .not('vaccination_id', 'is', null);

      console.log(`   ${count || 0} usage_items have vaccination_id set\n`);
    }
  } catch (err) {
    console.log('❌ Error checking column:', err.message);
  }

  // Method 2: Check treatment_id nullable status
  try {
    const { data: usageItems } = await supabase
      .from('usage_items')
      .select('treatment_id')
      .is('treatment_id', null)
      .limit(1);

    if (usageItems && usageItems.length > 0) {
      console.log('✅ treatment_id is nullable (some records have NULL treatment_id)\n');
    } else {
      console.log('⚠️  treatment_id might not be nullable yet\n');
    }
  } catch (err) {
    console.log('Error checking treatment_id:', err.message);
  }

  // Method 3: Count total vaccinations
  const { count: totalVaccinations } = await supabase
    .from('vaccinations')
    .select('*', { count: 'exact', head: true })
    .not('batch_id', 'is', null)
    .not('dose_amount', 'is', null)
    .gt('dose_amount', 0);

  console.log(`📊 Database Stats:`);
  console.log(`   Total vaccinations with batch/dose: ${totalVaccinations || 0}`);

  // Check BioBos specifically
  const { data: biobos } = await supabase
    .from('products')
    .select('id, name')
    .ilike('name', '%BioBos RCC%')
    .single();

  if (biobos) {
    console.log(`\n📦 BioBos RCC (${biobos.id}):`);

    // Received stock
    const { data: received } = await supabase
      .from('atsargos')
      .select('qty, batch')
      .eq('product_id', biobos.id);

    const totalReceived = received?.reduce((sum, r) => sum + Number(r.qty), 0) || 0;
    console.log(`   Received: ${totalReceived} ml (${received?.length || 0} batches)`);

    // Vaccinations
    const { data: vaccinations, count: vacCount } = await supabase
      .from('vaccinations')
      .select('dose_amount', { count: 'exact' })
      .eq('product_id', biobos.id)
      .not('batch_id', 'is', null)
      .not('dose_amount', 'is', null)
      .gt('dose_amount', 0);

    const totalVacUsage = vaccinations?.reduce((sum, v) => sum + Number(v.dose_amount), 0) || 0;
    console.log(`   Vaccinations: ${vacCount || 0} records = ${totalVacUsage} ml`);

    // Usage items (treatments only if migration not applied)
    const { data: usage } = await supabase
      .from('usage_items')
      .select('qty, purpose')
      .eq('product_id', biobos.id);

    const totalUsage = usage?.reduce((sum, u) => sum + Number(u.qty), 0) || 0;
    console.log(`   Usage items: ${usage?.length || 0} records = ${totalUsage} ml`);

    console.log(`\n   📊 Stock calculation:`);
    console.log(`      Atsargos tab: ${totalReceived} - ${totalUsage} = ${totalReceived - totalUsage} ml`);
    console.log(`      Should be: ${totalReceived} - ${totalUsage} - ${totalVacUsage} = ${totalReceived - totalUsage - totalVacUsage} ml`);
    console.log(`      Discrepancy: ${totalVacUsage} ml (vaccinations not in usage_items)`);
  }

  console.log(`\n\n📋 ACTION NEEDED:`);
  console.log(`   Run fix-vaccination-backfill.sql in Supabase Dashboard SQL Editor`);
  console.log(`   This will add the missing ${totalVaccinations || 0} vaccinations to usage_items`);
}

checkMigrationStatus().catch(console.error);
