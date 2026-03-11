const fs = require('fs');
const { Client } = require('pg');
require('dotenv').config();

async function applySQL() {
  // Extract connection details from VITE_SUPABASE_URL
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const urlMatch = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
  if (!urlMatch) {
    throw new Error('Could not parse Supabase URL');
  }

  const projectRef = urlMatch[1];

  const client = new Client({
    host: `aws-0-${process.env.SUPABASE_DB_REGION || 'eu-central-1'}.pooler.supabase.com`,
    port: 6543,
    database: 'postgres',
    user: 'postgres.' + projectRef,
    password: process.env.SUPABASE_DB_PASSWORD,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to database');

    const sql = fs.readFileSync('fix-vehicle-and-cost-center-views.sql', 'utf8');

    await client.query(sql);
    console.log('✓ Views created successfully!');

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

applySQL();
