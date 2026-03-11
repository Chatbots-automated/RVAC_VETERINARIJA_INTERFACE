import pg from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function fixRLS() {
  // Connection string from Supabase
  const projectRef = 'olxnahsxvyiadknybagt';

  // Extract project ID from Supabase URL
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const match = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
  const actualProjectRef = match ? match[1] : projectRef;

  const client = new Client({
    host: `aws-0-eu-central-1.pooler.supabase.com`,
    port: 6543,
    database: 'postgres',
    user: `postgres.${actualProjectRef}`,
    password: process.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✓ Connected to database\n');

    // First, check current state
    const categoriesCount = await client.query('SELECT COUNT(*) FROM equipment_categories');
    console.log(`Found ${categoriesCount.rows[0].count} categories in database\n`);

    // Fix equipment_categories RLS
    console.log('Fixing equipment_categories RLS policies...');

    await client.query(`DROP POLICY IF EXISTS "Authenticated users can view equipment categories" ON equipment_categories;`);
    await client.query(`DROP POLICY IF EXISTS "Authenticated users can manage equipment categories" ON equipment_categories;`);
    await client.query(`DROP POLICY IF EXISTS "Authenticated users can update equipment categories" ON equipment_categories;`);
    await client.query(`DROP POLICY IF EXISTS "Authenticated users can delete equipment categories" ON equipment_categories;`);

    await client.query(`
      CREATE POLICY "Authenticated users can view equipment categories"
        ON equipment_categories FOR SELECT
        TO authenticated
        USING (true);
    `);

    await client.query(`
      CREATE POLICY "Authenticated users can insert equipment categories"
        ON equipment_categories FOR INSERT
        TO authenticated
        WITH CHECK (true);
    `);

    await client.query(`
      CREATE POLICY "Authenticated users can update equipment categories"
        ON equipment_categories FOR UPDATE
        TO authenticated
        USING (true)
        WITH CHECK (true);
    `);

    await client.query(`
      CREATE POLICY "Authenticated users can delete equipment categories"
        ON equipment_categories FOR DELETE
        TO authenticated
        USING (true);
    `);

    console.log('✓ equipment_categories RLS policies fixed\n');

    // Fix equipment_products RLS
    console.log('Fixing equipment_products RLS policies...');

    await client.query(`DROP POLICY IF EXISTS "Authenticated users can view equipment products" ON equipment_products;`);
    await client.query(`DROP POLICY IF EXISTS "Authenticated users can manage equipment products" ON equipment_products;`);
    await client.query(`DROP POLICY IF EXISTS "Authenticated users can insert equipment products" ON equipment_products;`);
    await client.query(`DROP POLICY IF EXISTS "Authenticated users can update equipment products" ON equipment_products;`);
    await client.query(`DROP POLICY IF EXISTS "Authenticated users can delete equipment products" ON equipment_products;`);

    await client.query(`
      CREATE POLICY "Authenticated users can view equipment products"
        ON equipment_products FOR SELECT
        TO authenticated
        USING (true);
    `);

    await client.query(`
      CREATE POLICY "Authenticated users can insert equipment products"
        ON equipment_products FOR INSERT
        TO authenticated
        WITH CHECK (true);
    `);

    await client.query(`
      CREATE POLICY "Authenticated users can update equipment products"
        ON equipment_products FOR UPDATE
        TO authenticated
        USING (true)
        WITH CHECK (true);
    `);

    await client.query(`
      CREATE POLICY "Authenticated users can delete equipment products"
        ON equipment_products FOR DELETE
        TO authenticated
        USING (true);
    `);

    console.log('✓ equipment_products RLS policies fixed\n');

    console.log('All RLS policies have been fixed successfully!');
    console.log('You should now be able to:');
    console.log('  - View categories in the dropdown');
    console.log('  - Create new products without RLS errors');

  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await client.end();
  }
}

fixRLS();
