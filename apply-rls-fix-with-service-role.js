import pg from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9seG5haHN4dnlpYWRrbnliYWd0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mjc3MTc4NiwiZXhwIjoyMDY4MzQ3Nzg2fQ.PvB43f77FD-zVVO8Kf_OxJ5pUQg3xbDA7nuL4S3Dt5U';

async function fixRLS() {
  const projectRef = 'olxnahsxvyiadknybagt';

  const client = new Client({
    host: `db.${projectRef}.supabase.co`,
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: SERVICE_KEY,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Connecting to database...\n');
    await client.connect();
    console.log('✓ Connected to database\n');

    // Check current categories count
    const categoriesCount = await client.query('SELECT COUNT(*) FROM equipment_categories');
    console.log(`Found ${categoriesCount.rows[0].count} categories in database\n`);

    console.log('Fixing equipment_categories RLS policies...\n');

    // Drop all existing policies for equipment_categories
    await client.query(`DROP POLICY IF EXISTS "Authenticated users can view equipment categories" ON equipment_categories CASCADE`);
    await client.query(`DROP POLICY IF EXISTS "Authenticated users can manage equipment categories" ON equipment_categories CASCADE`);
    await client.query(`DROP POLICY IF EXISTS "Authenticated users can insert equipment categories" ON equipment_categories CASCADE`);
    await client.query(`DROP POLICY IF EXISTS "Authenticated users can update equipment categories" ON equipment_categories CASCADE`);
    await client.query(`DROP POLICY IF EXISTS "Authenticated users can delete equipment categories" ON equipment_categories CASCADE`);

    console.log('✓ Dropped old category policies\n');

    // Create new policies for equipment_categories
    await client.query(`
      CREATE POLICY "Authenticated users can view equipment categories"
        ON equipment_categories FOR SELECT
        TO authenticated
        USING (true)
    `);

    await client.query(`
      CREATE POLICY "Authenticated users can insert equipment categories"
        ON equipment_categories FOR INSERT
        TO authenticated
        WITH CHECK (true)
    `);

    await client.query(`
      CREATE POLICY "Authenticated users can update equipment categories"
        ON equipment_categories FOR UPDATE
        TO authenticated
        USING (true)
        WITH CHECK (true)
    `);

    await client.query(`
      CREATE POLICY "Authenticated users can delete equipment categories"
        ON equipment_categories FOR DELETE
        TO authenticated
        USING (true)
    `);

    console.log('✓ Created new category policies\n');

    console.log('Fixing equipment_products RLS policies...\n');

    // Drop all existing policies for equipment_products
    await client.query(`DROP POLICY IF EXISTS "Authenticated users can view equipment products" ON equipment_products CASCADE`);
    await client.query(`DROP POLICY IF EXISTS "Authenticated users can manage equipment products" ON equipment_products CASCADE`);
    await client.query(`DROP POLICY IF EXISTS "Authenticated users can insert equipment products" ON equipment_products CASCADE`);
    await client.query(`DROP POLICY IF EXISTS "Authenticated users can update equipment products" ON equipment_products CASCADE`);
    await client.query(`DROP POLICY IF EXISTS "Authenticated users can delete equipment products" ON equipment_products CASCADE`);

    console.log('✓ Dropped old product policies\n');

    // Create new policies for equipment_products
    await client.query(`
      CREATE POLICY "Authenticated users can view equipment products"
        ON equipment_products FOR SELECT
        TO authenticated
        USING (true)
    `);

    await client.query(`
      CREATE POLICY "Authenticated users can insert equipment products"
        ON equipment_products FOR INSERT
        TO authenticated
        WITH CHECK (true)
    `);

    await client.query(`
      CREATE POLICY "Authenticated users can update equipment products"
        ON equipment_products FOR UPDATE
        TO authenticated
        USING (true)
        WITH CHECK (true)
    `);

    await client.query(`
      CREATE POLICY "Authenticated users can delete equipment products"
        ON equipment_products FOR DELETE
        TO authenticated
        USING (true)
    `);

    console.log('✓ Created new product policies\n');

    console.log('========================================');
    console.log('✓ ALL RLS POLICIES FIXED SUCCESSFULLY!');
    console.log('========================================\n');
    console.log('You can now:');
    console.log('  1. Refresh your browser');
    console.log('  2. See all categories in the dropdown');
    console.log('  3. Create new products without errors\n');

  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await client.end();
  }
}

fixRLS();
