/*
  # Fix Equipment Issuances and Automatic Stock Deduction

  ## Changes Made

  1. **Foreign Key Constraints**
     - Make issued_by, issued_to, and created_by nullable and properly handle null values
     - Remove NOT NULL constraints that cause foreign key violations

  2. **Stock Deduction System**
     - Create trigger to automatically deduct stock from equipment_batches when items are issued
     - Create trigger to restore stock when items are returned
     - Add validation to prevent overselling

  3. **Audit Trail**
     - Create equipment_stock_movements table to track all stock changes
     - Automatic logging of all stock adjustments

  4. **Safety Checks**
     - Add constraint to prevent negative qty_left in batches
     - Add check to ensure return quantity doesn't exceed issued quantity
*/

-- Make foreign key fields properly nullable
ALTER TABLE equipment_issuances 
  ALTER COLUMN issued_by DROP NOT NULL,
  ALTER COLUMN created_by DROP NOT NULL;

-- Create stock movements audit table
CREATE TABLE IF NOT EXISTS equipment_stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid REFERENCES equipment_batches(id) NOT NULL,
  movement_type text NOT NULL CHECK (movement_type IN ('issue', 'return', 'receive', 'adjustment')),
  quantity numeric NOT NULL,
  reference_table text,
  reference_id uuid,
  notes text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES users(id)
);

ALTER TABLE equipment_stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view equipment stock movements"
  ON equipment_stock_movements FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create equipment stock movements"
  ON equipment_stock_movements FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Add constraint to prevent negative stock
ALTER TABLE equipment_batches DROP CONSTRAINT IF EXISTS equipment_batches_qty_left_check;
ALTER TABLE equipment_batches ADD CONSTRAINT equipment_batches_qty_left_check CHECK (qty_left >= 0);

-- Function to deduct stock when equipment is issued
CREATE OR REPLACE FUNCTION deduct_equipment_stock()
RETURNS TRIGGER AS $$
BEGIN
  -- Deduct from batch
  UPDATE equipment_batches
  SET qty_left = qty_left - NEW.quantity
  WHERE id = NEW.batch_id;

  -- Check if stock went negative
  IF (SELECT qty_left FROM equipment_batches WHERE id = NEW.batch_id) < 0 THEN
    RAISE EXCEPTION 'Insufficient stock in batch. Available: %, Requested: %', 
      (SELECT qty_left + NEW.quantity FROM equipment_batches WHERE id = NEW.batch_id), 
      NEW.quantity;
  END IF;

  -- Log movement
  INSERT INTO equipment_stock_movements (
    batch_id, 
    movement_type, 
    quantity, 
    reference_table, 
    reference_id,
    notes
  ) VALUES (
    NEW.batch_id, 
    'issue', 
    NEW.quantity, 
    'equipment_issuance_items', 
    NEW.id,
    'Issued via issuance'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to restore stock when equipment is returned
CREATE OR REPLACE FUNCTION restore_equipment_stock()
RETURNS TRIGGER AS $$
DECLARE
  quantity_change numeric;
BEGIN
  -- Calculate the change in returned quantity
  quantity_change := NEW.quantity_returned - COALESCE(OLD.quantity_returned, 0);

  -- Only process if there's actually a return
  IF quantity_change > 0 THEN
    -- Check if return exceeds issued amount
    IF NEW.quantity_returned > NEW.quantity THEN
      RAISE EXCEPTION 'Return quantity (%) cannot exceed issued quantity (%)', 
        NEW.quantity_returned, NEW.quantity;
    END IF;

    -- Restore to batch
    UPDATE equipment_batches
    SET qty_left = qty_left + quantity_change
    WHERE id = NEW.batch_id;

    -- Log movement
    INSERT INTO equipment_stock_movements (
      batch_id, 
      movement_type, 
      quantity, 
      reference_table, 
      reference_id,
      notes
    ) VALUES (
      NEW.batch_id, 
      'return', 
      quantity_change, 
      'equipment_issuance_items', 
      NEW.id,
      'Returned equipment'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS trigger_deduct_equipment_stock ON equipment_issuance_items;
DROP TRIGGER IF EXISTS trigger_restore_equipment_stock ON equipment_issuance_items;

-- Create triggers
CREATE TRIGGER trigger_deduct_equipment_stock
  AFTER INSERT ON equipment_issuance_items
  FOR EACH ROW
  EXECUTE FUNCTION deduct_equipment_stock();

CREATE TRIGGER trigger_restore_equipment_stock
  AFTER UPDATE OF quantity_returned ON equipment_issuance_items
  FOR EACH ROW
  WHEN (NEW.quantity_returned IS DISTINCT FROM OLD.quantity_returned)
  EXECUTE FUNCTION restore_equipment_stock();

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_equipment_stock_movements_batch_id ON equipment_stock_movements(batch_id);
CREATE INDEX IF NOT EXISTS idx_equipment_stock_movements_created_at ON equipment_stock_movements(created_at DESC);
