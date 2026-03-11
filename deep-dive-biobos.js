import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function deepDive() {
  console.log('🔬 Deep dive into BioBos stock...\n');

  // Find ALL BioBos products
  const { data: products } = await supabase
    .from('products')
    .select('*')
    .ilike('name', '%BioBos%');

  console.log(`Found ${products?.length || 0} BioBos products:\n`);

  for (const prod of products || []) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📦 ${prod.name}`);
    console.log(`   ID: ${prod.id}`);
    console.log(`   Category: ${prod.category} | Subcategory: ${prod.subcategory || 'N/A'}`);

    // Get all received stock (atsargos)
    const { data: received } = await supabase
      .from('atsargos')
      .select('*')
      .eq('product_id', prod.id)
      .order('received_at', { ascending: false });

    const totalReceived = received?.reduce((sum, r) => sum + Number(r.qty), 0) || 0;

    console.log(`\n   📥 RECEIVED (atsargos):`);
    if (received && received.length > 0) {
      received.forEach(r => {
        console.log(`      ${r.received_at?.substring(0, 10)}: +${r.qty} ${r.unit} (batch: ${r.batch || 'N/A'})`);
      });
      console.log(`      TOTAL: ${totalReceived} ml`);
    } else {
      console.log(`      No received stock recorded`);
    }

    // Get all usage_items
    const { data: usageItems } = await supabase
      .from('usage_items')
      .select('*, vaccinations(animal_id, vaccination_date)')
      .eq('product_id', prod.id)
      .order('created_at', { ascending: false });

    const treatmentUsage = usageItems?.filter(u => !u.vaccination_id).reduce((sum, u) => sum + Number(u.qty), 0) || 0;
    const vaccinationUsage = usageItems?.filter(u => u.vaccination_id).reduce((sum, u) => sum + Number(u.qty), 0) || 0;
    const totalUsage = treatmentUsage + vaccinationUsage;

    console.log(`\n   📤 USAGE (usage_items):`);
    console.log(`      Treatments: ${usageItems?.filter(u => !u.vaccination_id).length || 0} records = ${treatmentUsage} ml`);
    console.log(`      Vaccinations: ${usageItems?.filter(u => u.vaccination_id).length || 0} records = ${vaccinationUsage} ml`);
    console.log(`      TOTAL: ${totalUsage} ml`);

    // Direct vaccination count
    const { count: vacCount } = await supabase
      .from('vaccinations')
      .select('*', { count: 'exact', head: true })
      .eq('product_id', prod.id)
      .not('batch_id', 'is', null)
      .not('dose_amount', 'is', null)
      .gt('dose_amount', 0);

    console.log(`\n   💉 VACCINATIONS TABLE:`);
    console.log(`      Total records: ${vacCount || 0}`);

    // Calculate stock
    const atsargosCalc = totalReceived - totalUsage;

    console.log(`\n   📊 STOCK CALCULATION:`);
    console.log(`      Received: ${totalReceived} ml`);
    console.log(`      Used: ${totalUsage} ml`);
    console.log(`      Stock: ${atsargosCalc} ml`);

    if (atsargosCalc < 0) {
      console.log(`      ⚠️  NEGATIVE STOCK! This means stock was used before it was recorded as received.`);
    }

    // Check for duplicates in usage_items
    const { data: duplicateCheck } = await supabase
      .from('usage_items')
      .select('vaccination_id')
      .eq('product_id', prod.id)
      .not('vaccination_id', 'is', null);

    const vacIds = duplicateCheck?.map(u => u.vaccination_id) || [];
    const uniqueVacIds = new Set(vacIds);

    if (vacIds.length !== uniqueVacIds.size) {
      console.log(`\n      ⚠️  DUPLICATE VACCINATIONS IN USAGE_ITEMS!`);
      console.log(`         Total: ${vacIds.length}, Unique: ${uniqueVacIds.size}`);
      console.log(`         This would cause DOUBLE deduction!`);
    }
  }

  console.log(`\n\n${'='.repeat(80)}`);
  console.log(`\n💡 If atsargos shows 572 ml but should be 548 ml:`);
  console.log(`   → 24 ml discrepancy = some usage not being counted`);
  console.log(`   → Check if some batches are excluded from calculation`);
  console.log(`   → Or if some usage_items have NULL batch_id`);
}

deepDive().catch(console.error);
