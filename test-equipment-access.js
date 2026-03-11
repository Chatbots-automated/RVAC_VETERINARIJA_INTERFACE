import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function testAccess() {
  console.log('Testing equipment categories access...\n');

  // Test 1: Try to fetch categories without auth (should fail with RLS)
  console.log('1. Testing without authentication:');
  const { data: unauthData, error: unauthError } = await supabase
    .from('equipment_categories')
    .select('*');

  if (unauthError) {
    console.log('   ✓ Correctly blocked:', unauthError.message);
  } else {
    console.log('   ⚠️  Unexpected: Got data without auth:', unauthData?.length, 'rows');
  }

  // Test 2: Sign in and try again
  console.log('\n2. Signing in as test user...');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'test@example.com',
    password: 'password123'
  });

  if (authError) {
    console.log('   ✗ Sign in failed:', authError.message);
    console.log('   (This is expected if test user does not exist)');
    return;
  }

  console.log('   ✓ Signed in as:', authData.user?.email);

  // Test 3: Fetch categories after auth
  console.log('\n3. Fetching categories as authenticated user:');
  const { data: authCats, error: authCatsError } = await supabase
    .from('equipment_categories')
    .select('*')
    .order('name');

  if (authCatsError) {
    console.log('   ✗ Error:', authCatsError.message);
    console.log('   This means RLS is still blocking authenticated users!');
  } else {
    console.log('   ✓ Success! Found', authCats?.length, 'categories:');
    authCats?.forEach(cat => {
      console.log('     -', cat.name, `(${cat.description})`);
    });
  }

  // Test 4: Try to insert a product
  console.log('\n4. Testing product creation:');
  const { data: newProduct, error: prodError } = await supabase
    .from('equipment_products')
    .insert({
      name: 'Test Product ' + Date.now(),
      unit_type: 'pcs',
      is_active: true,
      created_by: authData.user?.id,
    })
    .select()
    .single();

  if (prodError) {
    console.log('   ✗ Error:', prodError.message);
    console.log('   Details:', prodError);
  } else {
    console.log('   ✓ Success! Created product:', newProduct.name);

    // Clean up - delete the test product
    await supabase.from('equipment_products').delete().eq('id', newProduct.id);
    console.log('   (Cleaned up test product)');
  }

  console.log('\n========================================');
  console.log('Test complete!');
  console.log('========================================\n');
}

testAccess();
