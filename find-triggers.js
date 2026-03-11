import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Client } = pg;

async function findTriggers() {
  const client = new Client({
    connectionString: process.env.VITE_SUPABASE_DB_URL
  });

  await client.connect();

  console.log('Finding triggers on usage_items...\n');

  const triggersResult = await client.query(`
    SELECT 
      t.tgname as trigger_name,
      p.proname as function_name,
      pg_get_functiondef(p.oid) as function_definition
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_proc p ON t.tgfoid = p.oid
    WHERE c.relname = 'usage_items'
    AND t.tgname NOT LIKE 'RI_%'
    ORDER BY t.tgname;
  `);

  console.log('Triggers:', triggersResult.rows.length);
  for (const row of triggersResult.rows) {
    console.log('\n=====================================');
    console.log('Trigger:', row.trigger_name);
    console.log('Function:', row.function_name);
    console.log('\nDefinition:');
    console.log(row.function_definition);
  }

  await client.end();
}

findTriggers().catch(console.error);
