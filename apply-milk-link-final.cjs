/**
 * Migration Application Script
 * Links milk laboratory tests to milk weight records
 *
 * This script will:
 * 1. Display the migration SQL for manual application via Supabase Dashboard
 * 2. Check if the migration has been applied
 * 3. Show statistics on linked records
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

const PROJECT_REF = 'olxnahsxvyiadknybagt';

async function showMigrationInstructions() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Link Milk Tests to Milk Weights Migration                    ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log('📋 MIGRATION FILE: link-milk-tests-to-weights-migration.sql\n');

  console.log('To apply this migration, please use ONE of these methods:\n');

  console.log('┌─ METHOD 1: Supabase Dashboard (RECOMMENDED) ──────────────────┐');
  console.log('│                                                                 │');
  console.log('│  1. Open this URL in your browser:                             │');
  console.log(`│     https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new  │`);
  console.log('│                                                                 │');
  console.log('│  2. Copy and paste the entire contents of:                     │');
  console.log('│     link-milk-tests-to-weights-migration.sql                   │');
  console.log('│                                                                 │');
  console.log('│  3. Click the "RUN" button                                     │');
  console.log('│                                                                 │');
  console.log('│  4. Wait for completion (you should see success messages)      │');
  console.log('│                                                                 │');
  console.log('└─────────────────────────────────────────────────────────────────┘\n');

  console.log('┌─ METHOD 2: Supabase CLI ───────────────────────────────────────┐');
  console.log('│                                                                 │');
  console.log('│  1. Install Supabase CLI (if not installed):                   │');
  console.log('│     npm install -g supabase                                     │');
  console.log('│                                                                 │');
  console.log('│  2. Login to Supabase:                                          │');
  console.log('│     supabase login                                              │');
  console.log('│                                                                 │');
  console.log('│  3. Link to your project:                                       │');
  console.log(`│     supabase link --project-ref ${PROJECT_REF}              │`);
  console.log('│                                                                 │');
  console.log('│  4. Apply migrations:                                           │');
  console.log('│     supabase db push                                            │');
  console.log('│                                                                 │');
  console.log('└─────────────────────────────────────────────────────────────────┘\n');

  console.log('After applying the migration, run this script again to verify.\n');
}

async function checkMigrationStatus() {
  console.log('🔍 Checking current database status...\n');

  try {
    // Check if milk_weight_id column exists in milk_composition_tests
    const { data: compTest, error: compError } = await supabase
      .from('milk_composition_tests')
      .select('milk_weight_id')
      .limit(1);

    if (compError && compError.message.includes('column')) {
      console.log('❌ Migration NOT applied - milk_weight_id column not found\n');
      return false;
    }

    console.log('✅ Migration appears to be applied!\n');
    return true;

  } catch (error) {
    console.log('⚠️  Could not verify migration status:', error.message, '\n');
    return false;
  }
}

async function showStatistics() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Migration Results & Statistics                                ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    // Get composition tests statistics
    const { data: allComposition, error: compError } = await supabase
      .from('milk_composition_tests')
      .select('milk_weight_id, paemimo_data');

    if (compError) {
      console.log('❌ Error fetching composition tests:', compError.message);
      return;
    }

    // Get quality tests statistics
    const { data: allQuality, error: qualError } = await supabase
      .from('milk_quality_tests')
      .select('milk_weight_id, paemimo_data');

    if (qualError) {
      console.log('❌ Error fetching quality tests:', qualError.message);
      return;
    }

    // Get milk weights count
    const { data: weights, error: weightError } = await supabase
      .from('milk_weights')
      .select('id, date, session_type');

    if (weightError) {
      console.log('❌ Error fetching milk weights:', weightError.message);
      return;
    }

    const compositionLinked = allComposition?.filter(t => t.milk_weight_id !== null).length || 0;
    const compositionTotal = allComposition?.length || 0;
    const qualityLinked = allQuality?.filter(t => t.milk_weight_id !== null).length || 0;
    const qualityTotal = allQuality?.length || 0;
    const totalWeights = weights?.length || 0;
    const uniqueDates = new Set(weights?.map(w => w.date)).size || 0;

    console.log('📊 COMPOSITION TESTS');
    console.log('─────────────────────────────────────────────────────────────');
    console.log(`   Total tests:        ${compositionTotal}`);
    console.log(`   Linked to weights:  ${compositionLinked}`);
    console.log(`   Not linked:         ${compositionTotal - compositionLinked}`);
    console.log(`   Link rate:          ${compositionTotal > 0 ? ((compositionLinked / compositionTotal) * 100).toFixed(1) : 0}%\n`);

    console.log('📊 QUALITY TESTS');
    console.log('─────────────────────────────────────────────────────────────');
    console.log(`   Total tests:        ${qualityTotal}`);
    console.log(`   Linked to weights:  ${qualityLinked}`);
    console.log(`   Not linked:         ${qualityTotal - qualityLinked}`);
    console.log(`   Link rate:          ${qualityTotal > 0 ? ((qualityLinked / qualityTotal) * 100).toFixed(1) : 0}%\n`);

    console.log('📊 SUMMARY');
    console.log('─────────────────────────────────────────────────────────────');
    console.log(`   Total test records linked:  ${compositionLinked + qualityLinked}`);
    console.log(`   Total weight records:       ${totalWeights}`);
    console.log(`   Unique dates with weights:  ${uniqueDates}\n`);

    // Show sample of linked records
    console.log('📋 SAMPLE LINKED RECORDS (last 7 days)\n');

    const { data: samples, error: viewError } = await supabase
      .from('milk_data_combined')
      .select('*')
      .gte('date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      .order('date', { ascending: false })
      .order('session_type')
      .limit(10);

    if (!viewError && samples && samples.length > 0) {
      console.log('Date       │ Session  │ Weight │ Comp │ Qual │ Fat%  │ Protein%');
      console.log('───────────┼──────────┼────────┼──────┼──────┼───────┼─────────');

      samples.forEach(row => {
        const date = row.date || '';
        const session = (row.session_type || '').padEnd(8);
        const weight = (row.milk_weight_kg || 0).toString().padEnd(6);
        const hasComp = row.composition_test_id ? '  ✓  ' : '  ✗  ';
        const hasQual = row.quality_test_id ? '  ✓  ' : '  ✗  ';
        const fat = (row.fat_percentage ? row.fat_percentage.toFixed(2) : '-').padStart(5);
        const protein = (row.protein_percentage ? row.protein_percentage.toFixed(2) : '-').padStart(5);

        console.log(`${date} │ ${session} │ ${weight} │${hasComp}│${hasQual}│ ${fat} │ ${protein}`);
      });

      console.log('');
      console.log('✨ Migration completed successfully!');
      console.log('💡 New test records will be automatically linked to milk weights.\n');

    } else if (viewError) {
      console.log('⚠️  Combined view not accessible:', viewError.message);
      console.log('This is normal if the migration hasn\'t been fully applied yet.\n');
    } else {
      console.log('No records found in the last 7 days.\n');
    }

  } catch (error) {
    console.log('❌ Error generating statistics:', error.message, '\n');
  }
}

async function main() {
  const isApplied = await checkMigrationStatus();

  if (!isApplied) {
    await showMigrationInstructions();
  } else {
    await showStatistics();
  }
}

main().catch(console.error);
