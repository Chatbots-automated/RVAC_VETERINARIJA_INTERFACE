import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function investigateMedicineDeductions() {
  console.log('🔬 Investigating medicine stock deductions...\n');

  // Get all medicine products (exclude vaccines, technical, etc)
  const { data: medicineProducts } = await supabase
    .from('products')
    .select('id, name, category, subcategory')
    .in('category', ['Antibiotikai', 'Nesuda', 'Vaistai', 'Vitamins', 'Antiparasitic', 'Analgesics', 'Other Medicines'])
    .order('name');

  console.log(`Found ${medicineProducts?.length || 0} medicine products\n`);

  // For each medicine, check:
  // 1. How many treatments use it
  // 2. How many usage_items exist for it
  // 3. Are there treatments WITHOUT corresponding usage_items?

  const issues = [];

  for (const product of medicineProducts || []) {
    // Get all treatments using this product
    const { data: treatments } = await supabase
      .from('treatments')
      .select('id, animal_id, treatment_date, amount, batch_id')
      .eq('product_id', product.id)
      .order('treatment_date', { ascending: false });

    if (!treatments || treatments.length === 0) continue;

    // Get all usage_items for this product
    const { data: usageItems } = await supabase
      .from('usage_items')
      .select('treatment_id, qty, batch_id')
      .eq('product_id', product.id)
      .not('treatment_id', 'is', null);

    const usageItemsByTreatmentId = new Map(
      usageItems?.map(u => [u.treatment_id, u]) || []
    );

    // Find treatments without usage_items
    const missingUsageItems = [];
    const withUsageItems = [];

    for (const treatment of treatments) {
      if (!usageItemsByTreatmentId.has(treatment.id)) {
        missingUsageItems.push(treatment);
      } else {
        withUsageItems.push(treatment);
      }
    }

    if (missingUsageItems.length > 0) {
      issues.push({
        product,
        totalTreatments: treatments.length,
        missingCount: missingUsageItems.length,
        withUsageCount: withUsageItems.length,
        missingTreatments: missingUsageItems.slice(0, 3), // Show first 3
        withTreatments: withUsageItems.slice(0, 3)
      });
    }
  }

  if (issues.length === 0) {
    console.log('✅ All medicine treatments have corresponding usage_items!');
  } else {
    console.log(`⚠️  Found ${issues.length} products with missing usage_items:\n`);

    for (const issue of issues) {
      console.log(`📦 ${issue.product.name} (${issue.product.category})`);
      console.log(`   Total treatments: ${issue.totalTreatments}`);
      console.log(`   With usage_items: ${issue.withUsageCount} ✅`);
      console.log(`   WITHOUT usage_items: ${issue.missingCount} ❌`);

      if (issue.missingTreatments.length > 0) {
        console.log(`\n   Missing examples:`);
        for (const t of issue.missingTreatments) {
          console.log(`      Treatment ${t.id.substring(0, 8)}: ${t.amount} units, date: ${t.treatment_date}, batch: ${t.batch_id ? 'YES' : 'NO'}`);
        }
      }

      if (issue.withTreatments.length > 0) {
        console.log(`\n   Working examples:`);
        for (const t of issue.withTreatments) {
          console.log(`      Treatment ${t.id.substring(0, 8)}: ${t.amount} units, date: ${t.treatment_date}, batch: ${t.batch_id ? 'YES' : 'NO'}`);
        }
      }

      console.log('');
    }

    console.log(`\n🔍 PATTERN ANALYSIS:`);
    console.log(`   Looking for what's different between working and non-working treatments...\n`);

    // Check if it's related to batch_id
    for (const issue of issues.slice(0, 3)) {
      const missingWithBatch = issue.missingTreatments.filter(t => t.batch_id).length;
      const missingWithoutBatch = issue.missingTreatments.length - missingWithBatch;
      const workingWithBatch = issue.withTreatments.filter(t => t.batch_id).length;
      const workingWithoutBatch = issue.withTreatments.length - workingWithBatch;

      console.log(`   ${issue.product.name}:`);
      console.log(`      Missing: ${missingWithBatch} with batch, ${missingWithoutBatch} without`);
      console.log(`      Working: ${workingWithBatch} with batch, ${workingWithoutBatch} without`);
    }
  }

  // Check course medications
  console.log(`\n\n🔬 Checking course medications...\n`);

  const { data: courseMeds } = await supabase
    .from('course_medications')
    .select(`
      id,
      product_id,
      daily_dose,
      duration_days,
      status,
      batch_id,
      products(name, category)
    `)
    .in('status', ['active', 'completed'])
    .order('created_at', { ascending: false })
    .limit(20);

  console.log(`Found ${courseMeds?.length || 0} course medications\n`);

  for (const course of courseMeds?.slice(0, 5) || []) {
    const { data: usageItems } = await supabase
      .from('usage_items')
      .select('qty, course_medication_id')
      .eq('course_medication_id', course.id);

    const totalDeducted = usageItems?.reduce((sum, u) => sum + Number(u.qty), 0) || 0;
    const expectedTotal = course.daily_dose * course.duration_days;

    console.log(`   ${course.products.name} - ${course.status}`);
    console.log(`      Expected: ${expectedTotal} (${course.daily_dose} × ${course.duration_days} days)`);
    console.log(`      Deducted: ${totalDeducted}`);
    console.log(`      ${totalDeducted === expectedTotal ? '✅' : '❌ MISMATCH'}`);
  }
}

investigateMedicineDeductions().catch(console.error);
