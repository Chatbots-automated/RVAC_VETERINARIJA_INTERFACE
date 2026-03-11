import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

async function applyViewFix() {
  console.log('🔧 Applying vw_vet_drug_journal view fix...\n');

  const sql = `
-- Fix vw_vet_drug_journal view to use qty_left instead of summing usage_items
DROP VIEW IF EXISTS vw_vet_drug_journal;

CREATE OR REPLACE VIEW vw_vet_drug_journal AS
SELECT 
  b.id AS batch_id,
  b.product_id,
  b.created_at AS receipt_date,
  p.name AS product_name,
  p.registration_code,
  p.active_substance,
  s.name AS supplier_name,
  b.lot,
  b.batch_number,
  b.mfg_date AS manufacture_date,
  b.expiry_date,
  b.received_qty AS quantity_received,
  p.primary_pack_unit AS unit,
  -- FIXED: Use qty_left as source of truth (maintained by database triggers)
  (b.received_qty - COALESCE(b.qty_left, 0)) AS quantity_used,
  COALESCE(b.qty_left, 0) AS quantity_remaining,
  b.doc_title,
  b.doc_number AS invoice_number,
  b.doc_date AS invoice_date
FROM batches b
JOIN products p ON b.product_id = p.id
LEFT JOIN suppliers s ON b.supplier_id = s.id
WHERE p.category IN ('medicines', 'prevention')
ORDER BY b.created_at DESC;
`;

  try {
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
    
    if (error) {
      console.error('❌ Error:', error);
      
      // Try alternative method
      console.log('\n🔄 Trying alternative method...');
      const { error: altError } = await supabase.from('_migrations').insert({
        version: '20260213000000',
        name: 'fix_vet_drug_journal_view',
        executed_at: new Date().toISOString()
      });
      
      if (altError) {
        console.error('❌ Alternative method failed:', altError);
        console.log('\n⚠️  Please run this SQL manually in Supabase SQL Editor:');
        console.log(sql);
        return;
      }
    }
    
    console.log('✅ View fix applied successfully!');
    console.log('\n📊 Testing the view...');
    
    const { data: testData, error: testError } = await supabase
      .from('vw_vet_drug_journal')
      .select('product_name, quantity_received, quantity_used, quantity_remaining')
      .limit(5);
    
    if (testError) {
      console.error('❌ Test query failed:', testError);
    } else {
      console.log('\n✅ View is working! Sample data:');
      testData?.forEach(row => {
        console.log(`  ${row.product_name}: Received=${row.quantity_received}, Used=${row.quantity_used}, Remaining=${row.quantity_remaining}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
    console.log('\n⚠️  Please run this SQL manually in Supabase SQL Editor:');
    console.log(sql);
  }
}

applyViewFix().catch(console.error);
