import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function checkConstraints() {
  // Check table constraints
  const { data, error } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT 
        conname as constraint_name,
        pg_get_constraintdef(oid) as definition
      FROM pg_constraint
      WHERE conrelid = 'usage_items'::regclass
      AND contype = 'c';
    `
  });

  if (error) {
    console.log('Error checking constraints:', error);
    
    // Try alternative method
    const { data: cols, error: colError } = await supabase
      .from('usage_items')
      .select('*')
      .limit(1);
    
    console.log('\nSample usage_items row:', cols?.[0]);
    
    // Check table definition
    const { data: schema, error: schemaError } = await supabase.rpc('exec_sql', {
      sql: `
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'usage_items'
        ORDER BY ordinal_position;
      `
    });
    
    console.log('\nTable columns:', schema);
  } else {
    console.log('Constraints on usage_items:');
    data.forEach(c => {
      console.log(`\n${c.constraint_name}:`);
      console.log(c.definition);
    });
  }
}

checkConstraints();
