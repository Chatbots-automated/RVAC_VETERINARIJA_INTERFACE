const { createClient } = require('@supabase/supabase-js');
require('dotenv/config');

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

const migration = `
-- Equipment Categories
CREATE TABLE IF NOT EXISTS equipment_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  type text NOT NULL CHECK (type IN ('tool', 'ppe', 'operational_material', 'vehicle_part', 'other')),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Equipment Suppliers
CREATE TABLE IF NOT EXISTS equipment_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text,
  vat_code text,
  address text,
  contact_person text,
  phone text,
  email text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Equipment Products
CREATE TABLE IF NOT EXISTS equipment_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category_id uuid REFERENCES equipment_categories(id),
  sku text,
  description text,
  unit_type text DEFAULT 'piece' CHECK (unit_type IN ('piece', 'liter', 'kilogram', 'meter', 'box', 'set')),
  manufacturer text,
  model_number text,
  specifications jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Equipment Locations
CREATE TABLE IF NOT EXISTS equipment_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('warehouse', 'workshop', 'department', 'division', 'other')),
  parent_id uuid REFERENCES equipment_locations(id),
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Equipment Invoices
CREATE TABLE IF NOT EXISTS equipment_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL,
  invoice_date date NOT NULL,
  supplier_id uuid REFERENCES equipment_suppliers(id),
  supplier_name text NOT NULL,
  total_net decimal(10,2) DEFAULT 0,
  total_vat decimal(10,2) DEFAULT 0,
  total_gross decimal(10,2) DEFAULT 0,
  currency text DEFAULT 'EUR',
  pdf_url text,
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'received', 'completed')),
  received_by uuid REFERENCES users(id),
  received_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(invoice_number, supplier_id, total_gross)
);

-- Equipment Batches
CREATE TABLE IF NOT EXISTS equipment_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES equipment_products(id) NOT NULL,
  batch_number text,
  invoice_id uuid REFERENCES equipment_invoices(id),
  received_qty decimal(10,3) NOT NULL DEFAULT 0,
  qty_left decimal(10,3) NOT NULL DEFAULT 0,
  purchase_price decimal(10,2),
  expiry_date date,
  location_id uuid REFERENCES equipment_locations(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Equipment Invoice Items
CREATE TABLE IF NOT EXISTS equipment_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid REFERENCES equipment_invoices(id) NOT NULL,
  line_no integer NOT NULL,
  product_id uuid REFERENCES equipment_products(id),
  description text NOT NULL,
  quantity decimal(10,3) NOT NULL,
  unit_price decimal(10,2) NOT NULL,
  total_price decimal(10,2) NOT NULL,
  batch_id uuid REFERENCES equipment_batches(id),
  created_at timestamptz DEFAULT now()
);

-- Tools
CREATE TABLE IF NOT EXISTS tools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES equipment_products(id) NOT NULL,
  tool_number text UNIQUE NOT NULL,
  type text NOT NULL CHECK (type IN ('manual', 'electric', 'pneumatic', 'hydraulic')),
  serial_number text,
  condition text DEFAULT 'good' CHECK (condition IN ('new', 'good', 'fair', 'poor', 'needs_repair', 'retired')),
  current_holder uuid REFERENCES users(id),
  current_location_id uuid REFERENCES equipment_locations(id),
  purchase_date date,
  purchase_price decimal(10,2),
  last_maintenance_date date,
  notes text,
  is_available boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Tool Movements
CREATE TABLE IF NOT EXISTS tool_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id uuid REFERENCES tools(id) NOT NULL,
  movement_type text NOT NULL CHECK (movement_type IN ('checkout', 'return', 'transfer', 'maintenance', 'repair')),
  from_holder uuid REFERENCES users(id),
  to_holder uuid REFERENCES users(id),
  from_location_id uuid REFERENCES equipment_locations(id),
  to_location_id uuid REFERENCES equipment_locations(id),
  movement_date timestamptz DEFAULT now(),
  condition_before text,
  condition_after text,
  notes text,
  recorded_by uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now()
);

-- PPE Items
CREATE TABLE IF NOT EXISTS ppe_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES equipment_products(id) NOT NULL,
  ppe_type text NOT NULL CHECK (ppe_type IN ('helmet', 'gloves', 'boots', 'coverall', 'vest', 'mask', 'goggles', 'ear_protection', 'other')),
  size text,
  quantity_on_hand decimal(10,2) DEFAULT 0,
  min_stock_level decimal(10,2) DEFAULT 0,
  location_id uuid REFERENCES equipment_locations(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- PPE Issuance Records
CREATE TABLE IF NOT EXISTS ppe_issuance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES users(id) NOT NULL,
  ppe_item_id uuid REFERENCES ppe_items(id),
  product_id uuid REFERENCES equipment_products(id) NOT NULL,
  quantity_issued decimal(10,2) NOT NULL,
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  expected_return_date date,
  actual_return_date date,
  condition_on_return text,
  issued_by uuid REFERENCES users(id),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Vehicles
CREATE TABLE IF NOT EXISTS vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_number text UNIQUE NOT NULL,
  vehicle_type text NOT NULL CHECK (vehicle_type IN ('tractor', 'truck', 'car', 'harvester', 'sprayer', 'loader', 'trailer', 'other')),
  make text,
  model text,
  year integer,
  vin text,
  current_mileage decimal(10,1) DEFAULT 0,
  current_engine_hours decimal(10,1) DEFAULT 0,
  insurance_policy_number text,
  insurance_expiry_date date,
  insurance_company text,
  technical_inspection_date date,
  technical_inspection_due_date date,
  certificates jsonb DEFAULT '{}'::jsonb,
  assigned_to uuid REFERENCES users(id),
  location_id uuid REFERENCES equipment_locations(id),
  status text DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'inactive', 'retired')),
  purchase_date date,
  purchase_price decimal(10,2),
  notes text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Vehicle Mileage Log
CREATE TABLE IF NOT EXISTS vehicle_mileage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid REFERENCES vehicles(id) NOT NULL,
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  mileage decimal(10,1),
  engine_hours decimal(10,1),
  fuel_added decimal(10,2),
  fuel_cost decimal(10,2),
  recorded_by uuid REFERENCES users(id),
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Maintenance Schedules
CREATE TABLE IF NOT EXISTS maintenance_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid REFERENCES vehicles(id) NOT NULL,
  schedule_name text NOT NULL,
  description text,
  interval_type text NOT NULL CHECK (interval_type IN ('date', 'mileage', 'engine_hours', 'combined')),
  interval_days integer,
  interval_km decimal(10,1),
  interval_hours decimal(10,1),
  last_service_date date,
  last_service_mileage decimal(10,1),
  last_service_hours decimal(10,1),
  next_service_due_date date,
  next_service_due_mileage decimal(10,1),
  next_service_due_hours decimal(10,1),
  is_active boolean DEFAULT true,
  checklist jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Maintenance Work Orders
CREATE TABLE IF NOT EXISTS maintenance_work_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_number text UNIQUE NOT NULL,
  vehicle_id uuid REFERENCES vehicles(id) NOT NULL,
  order_type text NOT NULL CHECK (order_type IN ('planned', 'unplanned')),
  priority text DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  description text NOT NULL,
  scheduled_date date,
  started_date timestamptz,
  completed_date timestamptz,
  assigned_to uuid REFERENCES users(id),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  mileage_at_service decimal(10,1),
  engine_hours_at_service decimal(10,1),
  labor_hours decimal(10,2),
  labor_cost decimal(10,2),
  parts_cost decimal(10,2),
  total_cost decimal(10,2),
  maintenance_schedule_id uuid REFERENCES maintenance_schedules(id),
  notes text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Work Order Items
CREATE TABLE IF NOT EXISTS work_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid REFERENCES maintenance_work_orders(id) NOT NULL,
  product_id uuid REFERENCES equipment_products(id) NOT NULL,
  batch_id uuid REFERENCES equipment_batches(id),
  quantity decimal(10,3) NOT NULL,
  unit_cost decimal(10,2),
  total_cost decimal(10,2),
  created_at timestamptz DEFAULT now()
);

-- Equipment Audit Log
CREATE TABLE IF NOT EXISTS equipment_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
  old_values jsonb,
  new_values jsonb,
  changed_by uuid REFERENCES users(id),
  changed_at timestamptz DEFAULT now(),
  ip_address text
);
`;

const migration2 = `
-- Create indexes
CREATE INDEX IF NOT EXISTS idx_equipment_products_category ON equipment_products(category_id);
CREATE INDEX IF NOT EXISTS idx_equipment_products_active ON equipment_products(is_active);
CREATE INDEX IF NOT EXISTS idx_equipment_invoices_supplier ON equipment_invoices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_equipment_invoices_date ON equipment_invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_equipment_invoice_items_invoice ON equipment_invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_equipment_invoice_items_product ON equipment_invoice_items(product_id);
CREATE INDEX IF NOT EXISTS idx_equipment_batches_product ON equipment_batches(product_id);
CREATE INDEX IF NOT EXISTS idx_equipment_batches_invoice ON equipment_batches(invoice_id);
CREATE INDEX IF NOT EXISTS idx_equipment_batches_location ON equipment_batches(location_id);
CREATE INDEX IF NOT EXISTS idx_tools_product ON tools(product_id);
CREATE INDEX IF NOT EXISTS idx_tools_holder ON tools(current_holder);
CREATE INDEX IF NOT EXISTS idx_tools_location ON tools(current_location_id);
CREATE INDEX IF NOT EXISTS idx_tools_available ON tools(is_available);
CREATE INDEX IF NOT EXISTS idx_tool_movements_tool ON tool_movements(tool_id);
CREATE INDEX IF NOT EXISTS idx_tool_movements_date ON tool_movements(movement_date);
CREATE INDEX IF NOT EXISTS idx_ppe_items_product ON ppe_items(product_id);
CREATE INDEX IF NOT EXISTS idx_ppe_issuance_employee ON ppe_issuance_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_ppe_issuance_date ON ppe_issuance_records(issue_date);
CREATE INDEX IF NOT EXISTS idx_vehicles_type ON vehicles(vehicle_type);
CREATE INDEX IF NOT EXISTS idx_vehicles_status ON vehicles(status);
CREATE INDEX IF NOT EXISTS idx_vehicles_active ON vehicles(is_active);
CREATE INDEX IF NOT EXISTS idx_vehicle_mileage_vehicle ON vehicle_mileage_log(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_mileage_date ON vehicle_mileage_log(log_date);
CREATE INDEX IF NOT EXISTS idx_maintenance_schedules_vehicle ON maintenance_schedules(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_schedules_active ON maintenance_schedules(is_active);
CREATE INDEX IF NOT EXISTS idx_work_orders_vehicle ON maintenance_work_orders(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_status ON maintenance_work_orders(status);
CREATE INDEX IF NOT EXISTS idx_work_orders_date ON maintenance_work_orders(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_work_order_items_wo ON work_order_items(work_order_id);
CREATE INDEX IF NOT EXISTS idx_work_order_items_product ON work_order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_equipment_audit_table ON equipment_audit_log(table_name);
CREATE INDEX IF NOT EXISTS idx_equipment_audit_record ON equipment_audit_log(record_id);
CREATE INDEX IF NOT EXISTS idx_equipment_audit_date ON equipment_audit_log(changed_at);

-- Enable RLS
ALTER TABLE equipment_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE ppe_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE ppe_issuance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_mileage_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_audit_log ENABLE ROW LEVEL SECURITY;
`;

const migration3 = `
-- RLS Policies
CREATE POLICY "Users can view equipment categories" ON equipment_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage equipment categories" ON equipment_categories FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'vet')));

CREATE POLICY "Users can view equipment suppliers" ON equipment_suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage equipment suppliers" ON equipment_suppliers FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'vet')));

CREATE POLICY "Users can view equipment products" ON equipment_products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage equipment products" ON equipment_products FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'vet')));

CREATE POLICY "Users can view equipment locations" ON equipment_locations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage equipment locations" ON equipment_locations FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'vet')));

CREATE POLICY "Users can view equipment invoices" ON equipment_invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authorized users can manage equipment invoices" ON equipment_invoices FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'vet', 'assistant')));

CREATE POLICY "Users can view equipment invoice items" ON equipment_invoice_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authorized users can manage equipment invoice items" ON equipment_invoice_items FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'vet', 'assistant')));

CREATE POLICY "Users can view equipment batches" ON equipment_batches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authorized users can manage equipment batches" ON equipment_batches FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'vet', 'assistant')));

CREATE POLICY "Users can view tools" ON tools FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authorized users can manage tools" ON tools FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'vet', 'assistant')));

CREATE POLICY "Users can view tool movements" ON tool_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authorized users can create tool movements" ON tool_movements FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'vet', 'assistant')));

CREATE POLICY "Users can view PPE items" ON ppe_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authorized users can manage PPE items" ON ppe_items FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'vet', 'assistant')));

CREATE POLICY "Users can view their own PPE records" ON ppe_issuance_records FOR SELECT TO authenticated USING (employee_id = auth.uid() OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'vet', 'assistant')));
CREATE POLICY "Authorized users can manage PPE issuance" ON ppe_issuance_records FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'vet', 'assistant')));

CREATE POLICY "Users can view vehicles" ON vehicles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authorized users can manage vehicles" ON vehicles FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'vet', 'assistant')));

CREATE POLICY "Users can view vehicle mileage" ON vehicle_mileage_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authorized users can log vehicle mileage" ON vehicle_mileage_log FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'vet', 'assistant')));

CREATE POLICY "Users can view maintenance schedules" ON maintenance_schedules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authorized users can manage maintenance schedules" ON maintenance_schedules FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'vet', 'assistant')));

CREATE POLICY "Users can view work orders" ON maintenance_work_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authorized users can manage work orders" ON maintenance_work_orders FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'vet', 'assistant')));

CREATE POLICY "Users can view work order items" ON work_order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authorized users can manage work order items" ON work_order_items FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'vet', 'assistant')));

CREATE POLICY "Admins can view equipment audit log" ON equipment_audit_log FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));
CREATE POLICY "System can insert audit log entries" ON equipment_audit_log FOR INSERT TO authenticated WITH CHECK (true);
`;

const migration4 = `
-- Functions and Triggers
CREATE OR REPLACE FUNCTION update_equipment_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_equipment_categories_updated_at BEFORE UPDATE ON equipment_categories FOR EACH ROW EXECUTE FUNCTION update_equipment_updated_at();
CREATE TRIGGER update_equipment_suppliers_updated_at BEFORE UPDATE ON equipment_suppliers FOR EACH ROW EXECUTE FUNCTION update_equipment_updated_at();
CREATE TRIGGER update_equipment_products_updated_at BEFORE UPDATE ON equipment_products FOR EACH ROW EXECUTE FUNCTION update_equipment_updated_at();
CREATE TRIGGER update_equipment_locations_updated_at BEFORE UPDATE ON equipment_locations FOR EACH ROW EXECUTE FUNCTION update_equipment_updated_at();
CREATE TRIGGER update_equipment_invoices_updated_at BEFORE UPDATE ON equipment_invoices FOR EACH ROW EXECUTE FUNCTION update_equipment_updated_at();
CREATE TRIGGER update_equipment_batches_updated_at BEFORE UPDATE ON equipment_batches FOR EACH ROW EXECUTE FUNCTION update_equipment_updated_at();
CREATE TRIGGER update_tools_updated_at BEFORE UPDATE ON tools FOR EACH ROW EXECUTE FUNCTION update_equipment_updated_at();
CREATE TRIGGER update_ppe_items_updated_at BEFORE UPDATE ON ppe_items FOR EACH ROW EXECUTE FUNCTION update_equipment_updated_at();
CREATE TRIGGER update_ppe_issuance_updated_at BEFORE UPDATE ON ppe_issuance_records FOR EACH ROW EXECUTE FUNCTION update_equipment_updated_at();
CREATE TRIGGER update_vehicles_updated_at BEFORE UPDATE ON vehicles FOR EACH ROW EXECUTE FUNCTION update_equipment_updated_at();
CREATE TRIGGER update_maintenance_schedules_updated_at BEFORE UPDATE ON maintenance_schedules FOR EACH ROW EXECUTE FUNCTION update_equipment_updated_at();
CREATE TRIGGER update_work_orders_updated_at BEFORE UPDATE ON maintenance_work_orders FOR EACH ROW EXECUTE FUNCTION update_equipment_updated_at();

CREATE OR REPLACE FUNCTION deduct_work_order_stock()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    UPDATE equipment_batches eb
    SET qty_left = qty_left - woi.quantity
    FROM work_order_items woi
    WHERE woi.work_order_id = NEW.id AND woi.batch_id = eb.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_deduct_work_order_stock AFTER UPDATE ON maintenance_work_orders FOR EACH ROW EXECUTE FUNCTION deduct_work_order_stock();

CREATE OR REPLACE FUNCTION generate_work_order_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.work_order_number IS NULL OR NEW.work_order_number = '' THEN
    NEW.work_order_number := 'WO-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(NEXTVAL('work_order_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE SEQUENCE IF NOT EXISTS work_order_seq START 1;
CREATE TRIGGER trigger_generate_work_order_number BEFORE INSERT ON maintenance_work_orders FOR EACH ROW EXECUTE FUNCTION generate_work_order_number();
`;

const seedData = `
INSERT INTO equipment_categories (name, description, type, is_active) VALUES
  ('Rankiniai įrankiai', 'Manual hand tools', 'tool', true),
  ('Elektriniai įrankiai', 'Electric power tools', 'tool', true),
  ('Pneumatiniai įrankiai', 'Pneumatic tools', 'tool', true),
  ('Apsauginės pirštinės', 'Protective gloves', 'ppe', true),
  ('Apsauginiai batai', 'Safety boots', 'ppe', true),
  ('Apsauginiai kostiumai', 'Protective coveralls', 'ppe', true),
  ('Apsauginiai šalmai', 'Safety helmets', 'ppe', true),
  ('Tepalai', 'Lubricants and oils', 'operational_material', true),
  ('Filtrai', 'Filters', 'vehicle_part', true),
  ('Diržai', 'Belts', 'vehicle_part', true),
  ('Kita', 'Other equipment', 'other', true)
ON CONFLICT DO NOTHING;

INSERT INTO equipment_locations (name, type, description, is_active) VALUES
  ('Pagrindinis sandėlis', 'warehouse', 'Main equipment warehouse', true),
  ('Dirbtuvės', 'workshop', 'Maintenance workshop', true),
  ('Lauko darbai', 'department', 'Field operations', true)
ON CONFLICT DO NOTHING;
`;

async function applyMigration() {
  console.log('Applying Technika module migration...\n');

  try {
    console.log('Step 1: Creating tables...');
    const { error: error1 } = await supabase.rpc('exec_sql', { sql: migration });
    if (error1) throw error1;

    console.log('Step 2: Creating indexes and enabling RLS...');
    const { error: error2 } = await supabase.rpc('exec_sql', { sql: migration2 });
    if (error2) throw error2;

    console.log('Step 3: Creating RLS policies...');
    const { error: error3 } = await supabase.rpc('exec_sql', { sql: migration3 });
    if (error3) throw error3;

    console.log('Step 4: Creating functions and triggers...');
    const { error: error4 } = await supabase.rpc('exec_sql', { sql: migration4 });
    if (error4) throw error4;

    console.log('Step 5: Inserting seed data...');
    const { error: error5 } = await supabase.rpc('exec_sql', { sql: seedData });
    if (error5) throw error5;

    console.log('\n✅ Migration applied successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

applyMigration();
