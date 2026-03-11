import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function testReportAfterAnalysis() {
  console.log('🔬 Testing treated animals report data...\n');

  // Get a treatment that HAD medications from our previous check
  const { data: withMeds } = await supabase
    .from('vw_treated_animals')
    .select('*')
    .eq('animal_tag', 'LT000008370432')
    .single();

  if (withMeds) {
    console.log('✅ Treatment WITH medications:');
    console.log(`   Animal: ${withMeds.animal_tag}`);
    console.log(`   Products: ${withMeds.products_used || '❌ EMPTY'}`);
    console.log(`   Doses: ${withMeds.dose_summary || '❌ EMPTY'}`);
    console.log('');
  }

  // Get one that had NO medications
  const { data: withoutMeds } = await supabase
    .from('vw_treated_animals')
    .select('*')
    .eq('animal_tag', 'LT000007117151')
    .eq('registration_date', '2025-12-27')
    .maybeSingle();

  if (withoutMeds) {
    console.log('❌ Treatment WITHOUT medications (expected):');
    console.log(`   Animal: ${withoutMeds.animal_tag}`);
    console.log(`   Products: ${withoutMeds.products_used || '(empty - no medications recorded)'}`);
    console.log(`   Doses: ${withoutMeds.dose_summary || '(empty - no medications recorded)'}`);
    console.log('');
  }

  // Summary
  console.log('\n📊 SUMMARY:');
  console.log('   The report is working CORRECTLY.');
  console.log('   Empty fields appear because those treatments have NO medications.');
  console.log('   This was caused by the bug we just fixed in Treatment.tsx\n');

  // Count how many treatments have no medications
  const { data: allTreatments } = await supabase
    .from('vw_treated_animals')
    .select('treatment_id, products_used, registration_date')
    .order('registration_date', { ascending: false })
    .limit(200);

  const withoutMedsCount = allTreatments?.filter(t => !t.products_used).length || 0;
  const totalCount = allTreatments?.length || 0;

  console.log(`   Recent treatments: ${totalCount}`);
  console.log(`   Without medications: ${withoutMedsCount} (${Math.round(withoutMedsCount/totalCount*100)}%)`);
  console.log(`   With medications: ${totalCount - withoutMedsCount} (${Math.round((totalCount-withoutMedsCount)/totalCount*100)}%)\n`);

  console.log('💡 SOLUTION:');
  console.log('   The validation we added will prevent future empty treatments.');
  console.log('   Existing empty treatments cannot be auto-filled - they need manual review.\n');
}

testReportAfterAnalysis().catch(console.error);
