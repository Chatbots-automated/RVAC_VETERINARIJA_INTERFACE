require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');

const connectionString = process.env.VITE_SUPABASE_DB_URL;

if (!connectionString) {
  console.error('Missing VITE_SUPABASE_DB_URL');
  process.exit(1);
}

async function applyMigration() {
  const client = new Client({ connectionString });

  try {
    console.log('Connecting to database...');
    await client.connect();

    console.log('Reading migration file...');
    const sql = fs.readFileSync('./track-all-milk-events.sql', 'utf8');

    console.log('Applying migration...');
    await client.query(sql);

    console.log('✅ Migration applied successfully!');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

applyMigration();
