import 'dotenv/config';

const sql = `
CREATE OR REPLACE FUNCTION check_batch_stock()
RETURNS TRIGGER AS $$
DECLARE
  v_qty_left numeric;
  v_batch_number text;
  v_product_name text;
BEGIN
  -- Only check if we have a batch_id
  IF NEW.batch_id IS NOT NULL THEN
    -- Get current stock level and product info
    SELECT b.qty_left, b.batch_number, p.name
    INTO v_qty_left, v_batch_number, v_product_name
    FROM batches b
    JOIN products p ON b.product_id = p.id
    WHERE b.id = NEW.batch_id;

    -- Check if batch exists
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Batch % not found', NEW.batch_id;
    END IF;

    -- Check if we have enough stock
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
  console.log('🔧 Applying improved stock error message...\n');

  try {
    const response = await fetch(
      `${process.env.VITE_SUPABASE_URL}/rest/v1/rpc/exec_raw_sql`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${process.env.VITE_SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ query: sql }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Error:', error);
      console.log('\n📋 Please apply this SQL manually in Supabase dashboard:\n');
      console.log(sql);
      process.exit(1);
    }

    console.log('✅ Success! Stock error messages now include product name and batch info.\n');
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n📋 Please apply this SQL manually in Supabase dashboard:\n');
    console.log(sql);
    process.exit(1);
  }
}

applyFix();
