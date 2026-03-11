import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function checkTreatmentsSchema() {
  console.log('🔬 Checking treatments table schema...\n');

  // Use pg client to directly query
  const connectionString = process.env.DATABASE_URL || process.env.VITE_SUPABASE_DB_URL;

  if (!connectionString) {
    console.log('❌ No DB URL found in env');
    console.log('Available env vars:', Object.keys(process.env).filter(k => k.includes('SUPABASE') || k.includes('DATABASE')));
    return;
  }

  const client = new pg.Client({ connectionString });

  try {
    await client.connect();

    // Get column info
    const result = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'treatments'
      ORDER BY ordinal_position;
    `);

    console.log(`Treatments table columns (${result.rows.length}):\n`);

    for (const row of result.rows) {
      console.log(`   ${row.column_name}: ${row.data_type} ${row.is_nullable === 'NO' ? 'NOT NULL' : ''}`);
    }

    // Get some sample data
    const sample = await client.query(`
      SELECT * FROM treatments
      ORDER BY created_at DESC
      LIMIT 5;
    `);

    console.log(`\n\nSample treatments (${sample.rows.length}):\n`);

    for (const row of sample.rows) {
      console.log(`   ID: ${row.id?.substring(0, 8)}`);
      console.log(`   Product: ${row.product_id?.substring(0, 8)}`);
      console.log(`   Qty: ${row.qty || 'N/A'}`);
      console.log(`   Batch: ${row.batch_id ? 'YES' : 'NO'}`);
      console.log(`   Date: ${row.treatment_date || row.created_at?.substring(0, 10)}`);

      // Check if has usage_item
      const usage = await client.query(`
        SELECT qty FROM usage_items WHERE treatment_id = $1
      `, [row.id]);

      console.log(`   Usage item: ${usage.rows.length > 0 ? '✅ YES (' + usage.rows[0].qty + ' units)' : '❌ NO'}`);
      console.log('');
    }

  } finally {
    await client.end();
  }
}

checkTreatmentsSchema().catch(console.error);
