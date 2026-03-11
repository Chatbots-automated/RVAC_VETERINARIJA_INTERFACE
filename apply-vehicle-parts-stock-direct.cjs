const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing environment variables');
  process.exit(1);
}

// Extract project ref from URL
const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)[1];
const connectionString = `postgresql://postgres.${projectRef}:${supabaseServiceKey.replace('eyJ', '')}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;

async function applyMigration() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || connectionString,
  });

  try {
    console.log('Connecting to database...');
    await client.connect();

    console.log('Reading migration file...');
    const sql = fs.readFileSync(
      path.join(__dirname, 'apply-vehicle-parts-stock-deduction.sql'),
      'utf8'
    );

    console.log('Applying migration...');
    await client.query(sql);

    console.log('✓ Migration applied successfully!');
    console.log('Stock deduction triggers created for vehicle visit parts.');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

applyMigration();
