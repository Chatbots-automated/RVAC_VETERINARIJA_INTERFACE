import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function checkCategories() {
  console.log('🔬 Checking product categories...\n');

  // Get all unique categories
  const { data: products } = await supabase
    .from('products')
    .select('category, subcategory, name')
    .order('category', { ascending: true });

  const categories = new Map();

  for (const product of products || []) {
    if (!categories.has(product.category)) {
      categories.set(product.category, {
        count: 0,
        subcategories: new Set(),
        examples: []
      });
    }
    const cat = categories.get(product.category);
    cat.count++;
    if (product.subcategory) cat.subcategories.add(product.subcategory);
    if (cat.examples.length < 3) cat.examples.push(product.name);
  }

  console.log(`Found ${categories.size} categories:\n`);

  for (const [category, data] of categories) {
    console.log(`📦 ${category || 'NULL'} (${data.count} products)`);
    if (data.subcategories.size > 0) {
      console.log(`   Subcategories: ${Array.from(data.subcategories).join(', ')}`);
    }
    console.log(`   Examples: ${data.examples.join(', ')}`);
    console.log('');
  }

  // Now check treatments by category
  console.log(`\n🔬 Checking treatments by category...\n`);

  const { data: treatmentsWithProducts } = await supabase
    .from('treatments')
    .select(`
      id,
      amount,
      treatment_date,
      batch_id,
      products(name, category, subcategory)
    `)
    .order('treatment_date', { ascending: false })
    .limit(100);

  const treatmentsByCategory = new Map();

  for (const treatment of treatmentsWithProducts || []) {
    const cat = treatment.products?.category || 'NULL';
    if (!treatmentsByCategory.has(cat)) {
      treatmentsByCategory.set(cat, []);
    }
    treatmentsByCategory.get(cat).push(treatment);
  }

  console.log(`Analyzed ${treatmentsWithProducts?.length || 0} recent treatments:\n`);

  for (const [category, treatments] of treatmentsByCategory) {
    console.log(`📦 ${category}: ${treatments.length} treatments`);

    // Check which have usage_items
    for (const treatment of treatments.slice(0, 3)) {
      const { data: usageItems } = await supabase
        .from('usage_items')
        .select('qty')
        .eq('treatment_id', treatment.id);

      const hasUsage = usageItems && usageItems.length > 0;
      console.log(`   ${treatment.products.name}: ${hasUsage ? '✅' : '❌'} (batch: ${treatment.batch_id ? 'YES' : 'NO'})`);
    }
    console.log('');
  }
}

checkCategories().catch(console.error);
