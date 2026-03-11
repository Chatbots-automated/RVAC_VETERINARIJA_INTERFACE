// Script to fix foreign key constraints for tool_movements and vehicles
// Run this with: node fix-foreign-keys-direct.cjs

const { Client } = require('pg');
require('dotenv').config();

// Get the database URL from environment
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('Missing DATABASE_URL environment variable. Check your .env file.');
  process.exit(1);
}

async function fixConstraints() {
  const client = new Client({
    connectionString: databaseUrl,
  });

  try {
    await client.connect();
    console.log('Connected to database');

    console.log('\n=== Fixing tool_movements constraints ===');

    // Drop existing constraints
    await client.query(`
      ALTER TABLE tool_movements
        DROP CONSTRAINT IF EXISTS tool_movements_recorded_by_fkey;
    `);
    console.log('Dropped tool_movements_recorded_by_fkey');

    await client.query(`
      ALTER TABLE tool_movements
        DROP CONSTRAINT IF EXISTS tool_movements_to_holder_fkey;
    `);
    console.log('Dropped tool_movements_to_holder_fkey');

    await client.query(`
      ALTER TABLE tool_movements
        DROP CONSTRAINT IF EXISTS tool_movements_from_holder_fkey;
    `);
    console.log('Dropped tool_movements_from_holder_fkey');

    // Recreate constraints with ON DELETE SET NULL
    await client.query(`
      ALTER TABLE tool_movements
        ADD CONSTRAINT tool_movements_recorded_by_fkey
        FOREIGN KEY (recorded_by)
        REFERENCES users(id)
        ON DELETE SET NULL;
    `);
    console.log('Created tool_movements_recorded_by_fkey with ON DELETE SET NULL');

    await client.query(`
      ALTER TABLE tool_movements
        ADD CONSTRAINT tool_movements_to_holder_fkey
        FOREIGN KEY (to_holder)
        REFERENCES users(id)
        ON DELETE SET NULL;
    `);
    console.log('Created tool_movements_to_holder_fkey with ON DELETE SET NULL');

    await client.query(`
      ALTER TABLE tool_movements
        ADD CONSTRAINT tool_movements_from_holder_fkey
        FOREIGN KEY (from_holder)
        REFERENCES users(id)
        ON DELETE SET NULL;
    `);
    console.log('Created tool_movements_from_holder_fkey with ON DELETE SET NULL');

    console.log('\n=== Verifying vehicles constraint ===');

    // Check vehicles constraint
    const result = await client.query(`
      SELECT constraint_name, delete_rule
      FROM information_schema.referential_constraints
      WHERE constraint_name = 'vehicles_created_by_fkey';
    `);

    if (result.rows.length > 0) {
      console.log('vehicles_created_by_fkey exists with delete_rule:', result.rows[0].delete_rule);
    }

    console.log('\n✅ All constraints fixed successfully!');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

fixConstraints();
