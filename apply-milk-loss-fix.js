import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
  {
    db: {
      schema: 'public',
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// Read the SQL
const sql = readFileSync('./fix-milk-loss-double-safety.sql', 'utf8');

// Extract just the function definition
const functionMatch = sql.match(/CREATE OR REPLACE FUNCTION[\s\S]*?\$\$;/);
const functionSql = functionMatch ? functionMatch[0] : sql;

console.log('Applying milk loss calculation fix...\n');
console.log('Executing SQL...');

// Try to execute via raw SQL if possible
fetch(`${process.env.VITE_SUPABASE_URL}/rest/v1/rpc/exec`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': process.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${process.env.VITE_SUPABASE_SERVICE_ROLE_KEY}`
  },
  body: JSON.stringify({ sql: functionSql })
}).then(async (res) => {
  if (!res.ok) {
    console.log('Cannot execute SQL directly, function may need manual update\n');
  } else {
    console.log('✓ Function updated\n');
  }

  // Verify regardless
  console.log('Verifying calculation...\n');

  const { data: t } = await supabase
    .from('treatments')
    .select('id')
    .eq('animal_id', '051cb782-120c-451d-ae23-b6f23812e9c3')
    .eq('reg_date', '2025-11-26')
    .single();

  const { data: result } = await supabase
    .rpc('calculate_treatment_milk_loss', { p_treatment_id: t.id })
    .single();

  console.log('Treatment: 2025-11-26');
  console.log('Withdrawal until: ' + result.withdrawal_until);
  console.log('Withdrawal days:', result.withdrawal_days);
  console.log('Total loss days:', result.total_loss_days);
  console.log('Total milk lost:', result.total_milk_lost_kg.toFixed(2), 'kg');
  console.log('Total value lost:', result.total_value_lost_eur.toFixed(2), '€');
  console.log('\nExpected: 6 days');
  console.log('Status:', result.total_loss_days === 6 ? '✓ CORRECT!' : '✗ Needs manual fix');

  if (result.total_loss_days !== 6) {
    console.log('\n⚠️  The function needs to be updated manually.');
    console.log('Please apply the SQL from: fix-milk-loss-double-safety.sql');
  }
}).catch(console.error);
