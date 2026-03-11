import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function analyzeMissingDeductions() {
  console.log('🔬 Analyzing why some treatments are missing usage_items...\n');

  // Get recent treatments from the last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: recentTreatments } = await supabase
    .from('treatments')
    .select('*')
    .gte('created_at', sevenDaysAgo.toISOString())
    .order('created_at', { ascending: false });

  console.log(`Found ${recentTreatments?.length || 0} treatments in last 7 days\n`);

  if (!recentTreatments || recentTreatments.length === 0) {
    console.log('No recent treatments found');
    return;
  }

  const withUsage = [];
  const withoutUsage = [];

  for (const treatment of recentTreatments) {
    const { data: usageItems } = await supabase
      .from('usage_items')
      .select('*')
      .eq('treatment_id', treatment.id);

    if (usageItems && usageItems.length > 0) {
      withUsage.push({ treatment, usageItems });
    } else {
      withoutUsage.push(treatment);
    }
  }

  console.log(`📊 BREAKDOWN:`);
  console.log(`   WITH usage_items: ${withUsage.length} ✅`);
  console.log(`   WITHOUT usage_items: ${withoutUsage.length} ❌\n`);

  if (withUsage.length > 0) {
    console.log(`✅ TREATMENTS WITH USAGE_ITEMS (${withUsage.length}):\n`);

    for (const { treatment, usageItems } of withUsage.slice(0, 5)) {
      const { data: animal } = await supabase
        .from('animals')
        .select('ear_tag')
        .eq('id', treatment.animal_id)
        .maybeSingle();

      console.log(`   Animal: ${animal?.ear_tag || 'Unknown'}`);
      console.log(`   Date: ${treatment.created_at?.substring(0, 16)}`);
      console.log(`   Visit ID: ${treatment.visit_id ? 'YES' : 'NO'}`);
      console.log(`   Diagnosis: ${treatment.clinical_diagnosis || 'N/A'}`);
      console.log(`   Medications used: ${usageItems.length}`);

      for (const item of usageItems) {
        const { data: product } = await supabase
          .from('products')
          .select('name')
          .eq('id', item.product_id)
          .maybeSingle();

        console.log(`      - ${product?.name}: ${item.qty} ${item.unit}`);
      }
      console.log('');
    }
  }

  if (withoutUsage.length > 0) {
    console.log(`\n❌ TREATMENTS WITHOUT USAGE_ITEMS (${withoutUsage.length}):\n`);

    for (const treatment of withoutUsage.slice(0, 10)) {
      const { data: animal } = await supabase
        .from('animals')
        .select('ear_tag')
        .eq('id', treatment.animal_id)
        .maybeSingle();

      console.log(`   Animal: ${animal?.ear_tag || 'Unknown'}`);
      console.log(`   Date: ${treatment.created_at?.substring(0, 16)}`);
      console.log(`   Visit ID: ${treatment.visit_id ? 'YES' : 'NO'}`);
      console.log(`   Diagnosis: ${treatment.clinical_diagnosis || 'N/A'}`);
      console.log(`   Creates future visits: ${treatment.creates_future_visits}`);
      console.log('');
    }

    console.log(`\n🔍 PATTERN ANALYSIS:`);

    const withVisit = withoutUsage.filter(t => t.visit_id).length;
    const withoutVisit = withoutUsage.filter(t => !t.visit_id).length;

    console.log(`   With visit_id: ${withVisit}`);
    console.log(`   Without visit_id: ${withoutVisit}`);

    const withFutureVisits = withoutUsage.filter(t => t.creates_future_visits).length;
    console.log(`   Creates future visits: ${withFutureVisits}`);

    // Check if they have diagnosis but no meds
    const withDiagnosis = withoutUsage.filter(t => t.clinical_diagnosis).length;
    console.log(`   Has diagnosis: ${withDiagnosis}`);
  }

  // Compare characteristics
  console.log(`\n\n📊 COMPARISON:`);

  const withUsageHasVisit = withUsage.filter(t => t.treatment.visit_id).length;
  const withoutUsageHasVisit = withoutUsage.filter(t => t.visit_id).length;

  console.log(`   Treatments WITH usage that have visit_id: ${withUsageHasVisit}/${withUsage.length}`);
  console.log(`   Treatments WITHOUT usage that have visit_id: ${withoutUsageHasVisit}/${withoutUsage.length}`);

  console.log(`\n💡 HYPOTHESIS:`);
  console.log(`   Treatments without usage_items might be:`);
  console.log(`   1. Created without medications being added`);
  console.log(`   2. Future scheduled treatments that haven't been performed yet`);
  console.log(`   3. Treatments where stock deduction failed or was skipped`);
}

analyzeMissingDeductions().catch(console.error);
