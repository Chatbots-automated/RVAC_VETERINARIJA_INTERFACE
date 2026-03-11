require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: 'public' }
  }
);

const sql = `
CREATE OR REPLACE FUNCTION check_batch_stock()
RETURNS TRIGGER AS $$
DECLARE
  v_qty_left numeric;
  v_batch_number text;
  v_product_name text;
BEGIN
  IF NEW.batch_id IS NOT NULL THEN
    SELECT b.qty_left, b.batch_number, p.name
    INTO v_qty_left, v_batch_number, v_product_name
    FROM batches b
    JOIN products p ON b.product_id = p.id
    WHERE b.id = NEW.batch_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Batch % not found', NEW.batch_id;
    END IF;

    IF v_qty_left IS NULL THEN
      RAISE EXCEPTION 'Batch % (%) has NULL qty_left', v_batch_number, v_product_name;
    END IF;

    IF v_qty_left < NEW.qty THEN
      RAISE EXCEPTION 'Not enough stock for "%" (batch: %). Left: %, Tried: %',
        v_product_name, v_batch_number, v_qty_left, NEW.qty;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
`;

async function applyFix() {
  console.log('\n🔧 Updating stock error messages...\n');
  
  // Test current function
  console.log('Testing if we can query batches and products...');
  const { data: testData, error: testError } = await supabase
    .from('batches')
    .select('id, qty_left, batch_number, product_id, products(name)')
    .limit(1);
    
  if (testError) {
    console.error('Test query error:', testError);
  } else {
    console.log('✅ Can access batches and products\n');
  }
  
  console.log('📋 SQL to apply in Supabase Dashboard:');
  console.log('   https://supabase.com/dashboard/project/olxnahsxvyiadknybagt/sql/new\n');
  console.log(sql);
  console.log('\n✅ After running this SQL, error messages will show:');
  console.log('   "Not enough stock for \\"Product Name\\" (batch: B-20240101-abc). Left: 5, Tried: 10"\n');
}

applyFix().catch(console.error);
