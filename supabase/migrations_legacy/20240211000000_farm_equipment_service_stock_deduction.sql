-- Update farm_equipment_service_parts to use batches for stock deduction
-- This allows proper stock tracking when parts are used during maintenance

-- Drop the old table structure
DROP TABLE IF EXISTS public.farm_equipment_service_parts CASCADE;

-- Recreate with batch_id instead of invoice_item_id
CREATE TABLE IF NOT EXISTS public.farm_equipment_service_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_record_id uuid NOT NULL REFERENCES public.farm_equipment_service_records(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.equipment_batches(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.equipment_products(id),
  quantity_used numeric NOT NULL CHECK (quantity_used > 0),
  unit_price numeric,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid
);

-- Function to deduct stock when service parts are added
CREATE OR REPLACE FUNCTION deduct_farm_equipment_service_stock()
RETURNS TRIGGER AS $$
DECLARE
  v_qty_left numeric;
  v_batch_number text;
BEGIN
  -- Get current batch info
  SELECT qty_left, batch_number
  INTO v_qty_left, v_batch_number
  FROM equipment_batches
  WHERE id = NEW.batch_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Batch % not found', NEW.batch_id;
  END IF;
  
  -- Check if sufficient stock
  IF v_qty_left < NEW.quantity_used THEN
    RAISE EXCEPTION 'Insufficient stock in batch %. Available: %, Required: %',
      v_batch_number, v_qty_left, NEW.quantity_used;
  END IF;
  
  -- Deduct from batch
  UPDATE equipment_batches
  SET qty_left = qty_left - NEW.quantity_used
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
    'issue',
    NEW.quantity_used,
    'farm_equipment_service_parts',
    NEW.id,
    'Used in farm equipment maintenance'
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger
CREATE TRIGGER trigger_deduct_farm_equipment_service_stock
  AFTER INSERT ON public.farm_equipment_service_parts
  FOR EACH ROW
  EXECUTE FUNCTION deduct_farm_equipment_service_stock();

-- Disable RLS on service_parts (to match other tables)
ALTER TABLE public.farm_equipment_service_parts DISABLE ROW LEVEL SECURITY;

-- Grant permissions
GRANT ALL ON public.farm_equipment_service_parts TO authenticated, service_role, anon;
