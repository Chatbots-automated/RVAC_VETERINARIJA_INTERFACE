import pg from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function fixRLS() {
  // Parse the DATABASE_URL to get connection details
  const dbUrl = process.env.VITE_SUPABASE_URL.replace('https://', '');
  const projectRef = dbUrl.split('.')[0];

  const client = new Client({
    host: `aws-0-eu-central-1.pooler.supabase.com`,
    port: 6543,
    database: 'postgres',
    user: `postgres.${projectRef}`,
    password: process.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to database\n');

    // Fix equipment_categories RLS
    console.log('1. Fixing equipment_categories RLS...');

    await client.query(`DROP POLICY IF EXISTS "Authenticated users can view equipment categories" ON equipment_categories;`);
    await client.query(`DROP POLICY IF EXISTS "Authenticated users can manage equipment categories" ON equipment_categories;`);

    await client.query(`
      CREATE POLICY "Authenticated users can view equipment categories"
        ON equipment_categories FOR SELECT
        TO authenticated
        USING (true);
    `);

    await client.query(`
      CREATE POLICY "Authenticated users can manage equipment categories"
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

    console.log('✓ Categories RLS fixed\n');

    // Fix equipment_products RLS
    console.log('2. Fixing equipment_products RLS...');

    await client.query(`DROP POLICY IF EXISTS "Authenticated users can view equipment products" ON equipment_products;`);
    await client.query(`DROP POLICY IF EXISTS "Authenticated users can manage equipment products" ON equipment_products;`);

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

    console.log('✓ Products RLS fixed\n');

    // Test by checking categories count
    const result = await client.query('SELECT COUNT(*) FROM equipment_categories');
    console.log(`Categories in database: ${result.rows[0].count}`);

    console.log('\nAll RLS policies fixed successfully!');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

fixRLS();
