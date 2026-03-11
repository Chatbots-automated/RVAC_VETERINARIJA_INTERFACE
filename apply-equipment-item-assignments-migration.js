import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function applyMigration() {
  console.log('=== Applying Equipment Item Assignments Migration ===\n');

  const migration = `
-- Create the assignments table
CREATE TABLE IF NOT EXISTS public.equipment_invoice_item_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_item_id uuid NOT NULL REFERENCES public.equipment_invoice_items(id) ON DELETE CASCADE,
  assignment_type text NOT NULL CHECK (assignment_type IN ('vehicle', 'tool', 'building', 'general_farm')),
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  tool_id uuid REFERENCES public.tools(id) ON DELETE SET NULL,
  notes text,
  assigned_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_equipment_item_assignments_invoice_item
  ON public.equipment_invoice_item_assignments(invoice_item_id);

CREATE INDEX IF NOT EXISTS idx_equipment_item_assignments_vehicle
  ON public.equipment_invoice_item_assignments(vehicle_id)
  WHERE vehicle_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_equipment_item_assignments_tool
  ON public.equipment_invoice_item_assignments(tool_id)
  WHERE tool_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_equipment_item_assignments_type
  ON public.equipment_invoice_item_assignments(assignment_type);

-- Enable RLS
ALTER TABLE public.equipment_invoice_item_assignments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow all operations on equipment_invoice_item_assignments" ON public.equipment_invoice_item_assignments;

-- Create policies
CREATE POLICY "Allow all operations on equipment_invoice_item_assignments"
  ON public.equipment_invoice_item_assignments
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- Create a view for easy reporting
CREATE OR REPLACE VIEW public.vehicle_parts_usage AS
SELECT
  v.id as vehicle_id,
  v.registration_number,
  v.make,
  v.model,
  v.vehicle_type,
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
  u.name as assigned_by_name
FROM public.equipment_invoice_item_assignments eia
INNER JOIN public.equipment_invoice_items eii ON eii.id = eia.invoice_item_id
INNER JOIN public.equipment_invoices ei ON ei.id = eii.invoice_id
LEFT JOIN public.equipment_products ep ON ep.id = eii.product_id
LEFT JOIN public.vehicles v ON v.id = eia.vehicle_id
LEFT JOIN public.users u ON u.id = eia.assigned_by
WHERE eia.assignment_type = 'vehicle'
ORDER BY v.registration_number, ei.invoice_date DESC;

-- Create a view for tool parts usage
CREATE OR REPLACE VIEW public.tool_parts_usage AS
SELECT
  t.id as tool_id,
  t.name as tool_name,
  t.model,
  t.serial_number,
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
  u.name as assigned_by_name
FROM public.equipment_invoice_item_assignments eia
INNER JOIN public.equipment_invoice_items eii ON eii.id = eia.invoice_item_id
INNER JOIN public.equipment_invoices ei ON ei.id = eii.invoice_id
LEFT JOIN public.equipment_products ep ON ep.id = eii.product_id
LEFT JOIN public.tools t ON t.id = eia.tool_id
LEFT JOIN public.users u ON u.id = eia.assigned_by
WHERE eia.assignment_type = 'tool'
ORDER BY t.name, ei.invoice_date DESC;
`;

  try {
    console.log('Executing migration...\n');
    const { data, error } = await supabase.rpc('exec_sql', { sql: migration });

    if (error) {
      console.error('Migration failed:', error);
      console.log('\n⚠️  Manual execution required. Please run the following SQL in Supabase Dashboard:\n');
      console.log(migration);
      return;
    }

    console.log('✅ Migration applied successfully!');
    console.log('\nCreated:');
    console.log('- Table: equipment_invoice_item_assignments');
    console.log('- View: vehicle_parts_usage');
    console.log('- View: tool_parts_usage');
  } catch (err) {
    console.error('Error:', err);
    console.log('\n⚠️  Manual execution required. Please run the following SQL in Supabase Dashboard:\n');
    console.log(migration);
  }
}

applyMigration();
