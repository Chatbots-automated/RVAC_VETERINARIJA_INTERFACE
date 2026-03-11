console.log('='.repeat(80));
console.log('COST CENTERS MIGRATION SQL');
console.log('='.repeat(80));
console.log('\nPlease execute the following SQL in your Supabase SQL Editor:\n');
console.log('Dashboard → SQL Editor → New Query → Paste and Run\n');
console.log('='.repeat(80));
console.log('\n');

const sql = `
-- Create cost_centers table
CREATE TABLE IF NOT EXISTS public.cost_centers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  color text NOT NULL DEFAULT '#3B82F6',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create index on cost centers
CREATE INDEX IF NOT EXISTS idx_cost_centers_active
  ON public.cost_centers(is_active)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_cost_centers_name
  ON public.cost_centers(name);

-- Enable RLS
ALTER TABLE public.cost_centers ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow all operations on cost_centers" ON public.cost_centers;

-- Create policies for cost centers
CREATE POLICY "Allow all operations on cost_centers"
  ON public.cost_centers
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- Add cost_center_id column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'equipment_invoice_item_assignments'
    AND column_name = 'cost_center_id'
  ) THEN
    ALTER TABLE public.equipment_invoice_item_assignments
    ADD COLUMN cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL;

    CREATE INDEX idx_equipment_item_assignments_cost_center
      ON public.equipment_invoice_item_assignments(cost_center_id)
      WHERE cost_center_id IS NOT NULL;
  END IF;
END $$;

-- Update constraint
ALTER TABLE public.equipment_invoice_item_assignments
  DROP CONSTRAINT IF EXISTS equipment_invoice_item_assignments_assignment_type_check;

ALTER TABLE public.equipment_invoice_item_assignments
  ADD CONSTRAINT equipment_invoice_item_assignments_assignment_type_check
  CHECK (assignment_type IN ('vehicle', 'tool', 'building', 'general_farm', 'cost_center'));

-- Create view for cost center parts usage
CREATE OR REPLACE VIEW public.cost_center_parts_usage AS
SELECT
  cc.id as cost_center_id,
  cc.name as cost_center_name,
  cc.description as cost_center_description,
  cc.color as cost_center_color,
  ei.invoice_number,
  ei.invoice_date,
  ei.supplier_name,
  ep.name as product_name,
  ep.product_code,
  eii.description as item_description,
  eii.quantity,
  eii.unit_price,
  eii.total_price,
  eia.notes as assignment_notes,
  eia.assigned_at,
  u.full_name as assigned_by_name
FROM public.equipment_invoice_item_assignments eia
INNER JOIN public.equipment_invoice_items eii ON eii.id = eia.invoice_item_id
INNER JOIN public.equipment_invoices ei ON ei.id = eii.invoice_id
LEFT JOIN public.equipment_products ep ON ep.id = eii.product_id
LEFT JOIN public.cost_centers cc ON cc.id = eia.cost_center_id
LEFT JOIN public.users u ON u.id = eia.assigned_by
WHERE eia.assignment_type = 'cost_center'
ORDER BY cc.name, ei.invoice_date DESC;

-- Create aggregated view for cost center summary
CREATE OR REPLACE VIEW public.cost_center_summary AS
SELECT
  cc.id as cost_center_id,
  cc.name as cost_center_name,
  cc.description,
  cc.color,
  cc.is_active,
  COUNT(DISTINCT eia.id) as total_assignments,
  COALESCE(SUM(eii.total_price), 0) as total_cost,
  MIN(ei.invoice_date) as first_assignment_date,
  MAX(ei.invoice_date) as last_assignment_date
FROM public.cost_centers cc
LEFT JOIN public.equipment_invoice_item_assignments eia ON eia.cost_center_id = cc.id
LEFT JOIN public.equipment_invoice_items eii ON eii.id = eia.invoice_item_id
LEFT JOIN public.equipment_invoices ei ON ei.id = eii.invoice_id
WHERE cc.is_active = true
GROUP BY cc.id, cc.name, cc.description, cc.color, cc.is_active
ORDER BY cc.name;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_cost_center_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updating updated_at
DROP TRIGGER IF EXISTS update_cost_center_updated_at_trigger ON public.cost_centers;
CREATE TRIGGER update_cost_center_updated_at_trigger
  BEFORE UPDATE ON public.cost_centers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_cost_center_updated_at();
`;

console.log(sql);
console.log('\n' + '='.repeat(80));
console.log('\nAfter running the SQL, the following will be created:');
console.log('✅ cost_centers table with RLS policies');
console.log('✅ cost_center_id column added to equipment_invoice_item_assignments');
console.log('✅ Updated assignment_type constraint to include "cost_center"');
console.log('✅ cost_center_parts_usage view');
console.log('✅ cost_center_summary view');
console.log('✅ Trigger for automatic updated_at timestamp');
console.log('='.repeat(80));
