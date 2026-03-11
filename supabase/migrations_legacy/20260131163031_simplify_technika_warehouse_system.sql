/*
  # Simplify Technika Warehouse System
  
  ## Overview
  Creates a unified, simplified warehouse system for the Technika module where:
  - All items come from invoices and go to centralized warehouse (equipment_batches)
  - Items can be issued to people with full traceability
  - Simple batch-based stock tracking
  - Clear audit trail from invoice → warehouse → person
  
  ## Changes
  
  1. New Table: equipment_issuances
     - Tracks when warehouse items are given to people
     - Links to batches and deducts quantities
     - Full traceability
  
  2. New Table: equipment_issuance_items  
     - Line items for each issuance
     - Links back to specific batches
  
  3. Trigger: Auto-deduct stock when issuing items
     - Automatically updates equipment_batches.qty_left when items are issued
  
  4. Trigger: Auto-restore stock when items are returned
     - Restores qty_left when issuance is marked as returned
*/

-- Table for tracking issuances (giving items to people)
CREATE TABLE IF NOT EXISTS equipment_issuances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuance_number text UNIQUE NOT NULL,
  issued_to uuid REFERENCES users(id),
  issued_to_name text,
  issued_by uuid REFERENCES users(id),
  issue_date timestamptz DEFAULT now(),
  expected_return_date date,
  actual_return_date date,
  status text DEFAULT 'issued' CHECK (status IN ('issued', 'partial_return', 'returned', 'lost')),
  notes text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES users(id)
);

-- Line items for issuances
CREATE TABLE IF NOT EXISTS equipment_issuance_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuance_id uuid REFERENCES equipment_issuances(id) ON DELETE CASCADE,
  batch_id uuid REFERENCES equipment_batches(id),
  product_id uuid REFERENCES equipment_products(id),
  quantity numeric NOT NULL CHECK (quantity > 0),
  quantity_returned numeric DEFAULT 0 CHECK (quantity_returned >= 0 AND quantity_returned <= quantity),
  unit_price numeric,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Trigger to deduct stock when items are issued
CREATE OR REPLACE FUNCTION deduct_equipment_stock()
RETURNS TRIGGER AS $$
BEGIN
  -- Deduct from batch
  UPDATE equipment_batches
  SET qty_left = qty_left - NEW.quantity
  WHERE id = NEW.batch_id;
  
  -- Check if stock went negative (shouldn't happen with proper validation)
  IF (SELECT qty_left FROM equipment_batches WHERE id = NEW.batch_id) < 0 THEN
    RAISE EXCEPTION 'Insufficient stock in batch';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_deduct_equipment_stock
  AFTER INSERT ON equipment_issuance_items
  FOR EACH ROW
  EXECUTE FUNCTION deduct_equipment_stock();

-- Trigger to restore stock when items are returned
CREATE OR REPLACE FUNCTION restore_equipment_stock()
RETURNS TRIGGER AS $$
BEGIN
  -- Only restore if quantity_returned increased
  IF NEW.quantity_returned > OLD.quantity_returned THEN
    UPDATE equipment_batches
    SET qty_left = qty_left + (NEW.quantity_returned - OLD.quantity_returned)
    WHERE id = NEW.batch_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_restore_equipment_stock
  AFTER UPDATE OF quantity_returned ON equipment_issuance_items
  FOR EACH ROW
  EXECUTE FUNCTION restore_equipment_stock();

-- Enable RLS
ALTER TABLE equipment_issuances ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_issuance_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Allow all operations on equipment_issuances"
  ON equipment_issuances
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations on equipment_issuance_items"
  ON equipment_issuance_items
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- View for current warehouse stock with product details
CREATE OR REPLACE VIEW equipment_warehouse_stock AS
SELECT 
  p.id as product_id,
  p.name as product_name,
  p.product_code,
  p.unit_type,
  c.name as category_name,
  SUM(b.qty_left) as total_qty,
  SUM(b.qty_left * b.purchase_price) as total_value,
  COUNT(b.id) as batch_count,
  MIN(b.purchase_price) as min_price,
  MAX(b.purchase_price) as max_price,
  AVG(b.purchase_price) as avg_price
FROM equipment_products p
LEFT JOIN equipment_batches b ON b.product_id = p.id AND b.qty_left > 0
LEFT JOIN equipment_categories c ON c.id = p.category_id
WHERE p.is_active = true
GROUP BY p.id, p.name, p.product_code, p.unit_type, c.name;

-- View for items currently issued to people
CREATE OR REPLACE VIEW equipment_items_on_loan AS
SELECT 
  ei.id as issuance_id,
  ei.issuance_number,
  ei.issued_to,
  COALESCE(u.full_name, ei.issued_to_name) as issued_to_name,
  ei.issue_date,
  ei.expected_return_date,
  ei.status,
  p.name as product_name,
  p.unit_type,
  eii.quantity as quantity_issued,
  eii.quantity_returned,
  (eii.quantity - eii.quantity_returned) as quantity_outstanding,
  eii.unit_price,
  (eii.quantity - eii.quantity_returned) * eii.unit_price as value_outstanding
FROM equipment_issuances ei
JOIN equipment_issuance_items eii ON eii.issuance_id = ei.id
JOIN equipment_products p ON p.id = eii.product_id
LEFT JOIN users u ON u.id = ei.issued_to
WHERE ei.status IN ('issued', 'partial_return')
  AND (eii.quantity - eii.quantity_returned) > 0
ORDER BY ei.issue_date DESC;

-- Function to generate issuance number
CREATE OR REPLACE FUNCTION generate_equipment_issuance_number()
RETURNS text AS $$
DECLARE
  next_num integer;
  new_number text;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(issuance_number FROM 'ISS-(.*)') AS INTEGER)), 0) + 1
  INTO next_num
  FROM equipment_issuances;
  
  new_number := 'ISS-' || LPAD(next_num::text, 6, '0');
  RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_equipment_issuances_issued_to ON equipment_issuances(issued_to);
CREATE INDEX IF NOT EXISTS idx_equipment_issuances_status ON equipment_issuances(status);
CREATE INDEX IF NOT EXISTS idx_equipment_issuance_items_batch ON equipment_issuance_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_equipment_issuance_items_product ON equipment_issuance_items(product_id);
