require('dotenv').config();
const { Client } = require('pg');

const connectionString = process.env.VITE_SUPABASE_DB_URL;

if (!connectionString) {
  console.error('Missing VITE_SUPABASE_DB_URL');
  process.exit(1);
}

const migration = `
-- Create cost_centers table with hierarchical support
CREATE TABLE IF NOT EXISTS cost_centers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  color text NOT NULL DEFAULT '#3B82F6',
  parent_id uuid REFERENCES cost_centers(id) ON DELETE CASCADE,
  is_active boolean DEFAULT true NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,

  -- Ensure unique names per user at each level
  UNIQUE(user_id, parent_id, name)
);

-- Create cost_center_items table for invoice assignments
CREATE TABLE IF NOT EXISTS cost_center_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cost_center_id uuid NOT NULL REFERENCES cost_centers(id) ON DELETE CASCADE,
  invoice_item_id uuid NOT NULL REFERENCES equipment_invoice_items(id) ON DELETE CASCADE,
  notes text,
  assigned_by uuid REFERENCES users(id),
  assigned_at timestamptz DEFAULT now() NOT NULL,

  -- Prevent duplicate assignments
  UNIQUE(invoice_item_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_cost_centers_user_id ON cost_centers(user_id);
CREATE INDEX IF NOT EXISTS idx_cost_centers_parent_id ON cost_centers(parent_id);
CREATE INDEX IF NOT EXISTS idx_cost_centers_is_active ON cost_centers(is_active);
CREATE INDEX IF NOT EXISTS idx_cost_center_items_cost_center_id ON cost_center_items(cost_center_id);
CREATE INDEX IF NOT EXISTS idx_cost_center_items_invoice_item_id ON cost_center_items(invoice_item_id);

-- Enable RLS
ALTER TABLE cost_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_center_items ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own cost centers" ON cost_centers;
DROP POLICY IF EXISTS "Users can insert own cost centers" ON cost_centers;
DROP POLICY IF EXISTS "Users can update own cost centers" ON cost_centers;
DROP POLICY IF EXISTS "Users can delete own cost centers" ON cost_centers;
DROP POLICY IF EXISTS "Users can view own cost center items" ON cost_center_items;
DROP POLICY IF EXISTS "Users can insert own cost center items" ON cost_center_items;
DROP POLICY IF EXISTS "Users can update own cost center items" ON cost_center_items;
DROP POLICY IF EXISTS "Users can delete own cost center items" ON cost_center_items;

-- RLS Policies for cost_centers
CREATE POLICY "Users can view own cost centers"
  ON cost_centers FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own cost centers"
  ON cost_centers FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own cost centers"
  ON cost_centers FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own cost centers"
  ON cost_centers FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- RLS Policies for cost_center_items
CREATE POLICY "Users can view own cost center items"
  ON cost_center_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM cost_centers
      WHERE cost_centers.id = cost_center_items.cost_center_id
      AND cost_centers.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own cost center items"
  ON cost_center_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM cost_centers
      WHERE cost_centers.id = cost_center_items.cost_center_id
      AND cost_centers.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own cost center items"
  ON cost_center_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM cost_centers
      WHERE cost_centers.id = cost_center_items.cost_center_id
      AND cost_centers.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM cost_centers
      WHERE cost_centers.id = cost_center_items.cost_center_id
      AND cost_centers.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own cost center items"
  ON cost_center_items FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM cost_centers
      WHERE cost_centers.id = cost_center_items.cost_center_id
      AND cost_centers.user_id = auth.uid()
    )
  );

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_cost_centers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cost_centers_updated_at ON cost_centers;
CREATE TRIGGER cost_centers_updated_at
  BEFORE UPDATE ON cost_centers
  FOR EACH ROW
  EXECUTE FUNCTION update_cost_centers_updated_at();

-- Create view for cost center summary
CREATE OR REPLACE VIEW cost_center_summary AS
SELECT
  cc.id AS cost_center_id,
  cc.name AS cost_center_name,
  cc.description,
  cc.color,
  cc.parent_id,
  cc.is_active,
  cc.user_id,
  COALESCE(COUNT(DISTINCT cci.id), 0) AS total_assignments,
  COALESCE(SUM(eii.total_price), 0) AS total_cost,
  MIN(cci.assigned_at) AS first_assignment_date,
  MAX(cci.assigned_at) AS last_assignment_date
FROM cost_centers cc
LEFT JOIN cost_center_items cci ON cc.id = cci.cost_center_id
LEFT JOIN equipment_invoice_items eii ON cci.invoice_item_id = eii.id
GROUP BY cc.id, cc.name, cc.description, cc.color, cc.parent_id, cc.is_active, cc.user_id;

-- Create view for detailed cost center items
CREATE OR REPLACE VIEW cost_center_items_detailed AS
SELECT
  cci.id,
  cci.cost_center_id,
  cc.name AS cost_center_name,
  cc.color AS cost_center_color,
  cci.invoice_item_id,
  ei.id AS invoice_id,
  ei.invoice_number,
  ei.invoice_date,
  s.name AS supplier_name,
  ep.name AS product_name,
  ep.product_code,
  eii.unit_type,
  epc.name AS category_name,
  eii.description AS item_description,
  eii.quantity,
  eii.unit_price,
  eii.total_price,
  cci.notes AS assignment_notes,
  cci.assigned_at,
  u.full_name AS assigned_by_name,
  cci.assigned_by,
  cc.user_id
FROM cost_center_items cci
JOIN cost_centers cc ON cci.cost_center_id = cc.id
JOIN equipment_invoice_items eii ON cci.invoice_item_id = eii.id
JOIN equipment_invoices ei ON eii.invoice_id = ei.id
LEFT JOIN suppliers s ON ei.supplier_id = s.id
LEFT JOIN equipment_products ep ON eii.product_id = ep.id
LEFT JOIN equipment_product_categories epc ON ep.category_id = epc.id
LEFT JOIN users u ON cci.assigned_by = u.id;
`;

async function applyMigration() {
  const client = new Client({ connectionString });

  try {
    console.log('Connecting to database...');
    await client.connect();

    console.log('Applying hierarchical cost centers migration...');
    await client.query(migration);

    console.log('\n✓ Migration applied successfully!');
    console.log('✓ cost_centers table created with parent_id column');
    console.log('✓ cost_center_items table created');
    console.log('✓ Indexes created');
    console.log('✓ RLS policies applied');
    console.log('✓ Views updated');

  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

applyMigration();
