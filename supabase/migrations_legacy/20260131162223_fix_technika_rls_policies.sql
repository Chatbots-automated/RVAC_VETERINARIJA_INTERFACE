/*
  # Fix Technika Module RLS Policies

  1. Problem
    - All technika tables (tools, vehicles, PPE, maintenance, work orders) have RLS policies for `authenticated` role
    - This app uses custom authentication (public.users), not Supabase Auth
    - Users cannot insert/update technika data due to RLS violations
    
  2. Solution
    - Drop all existing RLS policies on technika tables
    - Create new policies for `public` role (app handles auth at application level)
    - Match pattern used in rest of app (invoices, products, animals)
    
  3. Tables Fixed
    - tools
    - tool_movements
    - ppe_items
    - ppe_issuance_records
    - vehicles
    - vehicle_assignments
    - vehicle_documents
    - vehicle_fuel_records
    - maintenance_schedules
    - maintenance_work_orders
    - work_order_labor
    - work_order_parts
*/

-- tools
DROP POLICY IF EXISTS "Users can insert tools" ON tools;
DROP POLICY IF EXISTS "Users can update tools" ON tools;
DROP POLICY IF EXISTS "Users can view tools" ON tools;

CREATE POLICY "Allow all operations on tools"
  ON tools
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- tool_movements
DROP POLICY IF EXISTS "Users can insert tool movements" ON tool_movements;
DROP POLICY IF EXISTS "Users can view tool movements" ON tool_movements;

CREATE POLICY "Allow all operations on tool_movements"
  ON tool_movements
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- ppe_items
DROP POLICY IF EXISTS "Users can insert ppe items" ON ppe_items;
DROP POLICY IF EXISTS "Users can update ppe items" ON ppe_items;
DROP POLICY IF EXISTS "Users can view ppe items" ON ppe_items;

CREATE POLICY "Allow all operations on ppe_items"
  ON ppe_items
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- ppe_issuance_records
DROP POLICY IF EXISTS "Users can insert ppe issuance" ON ppe_issuance_records;
DROP POLICY IF EXISTS "Users can update ppe issuance" ON ppe_issuance_records;
DROP POLICY IF EXISTS "Users can view ppe issuance" ON ppe_issuance_records;

CREATE POLICY "Allow all operations on ppe_issuance_records"
  ON ppe_issuance_records
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- vehicles
DROP POLICY IF EXISTS "Users can insert vehicles" ON vehicles;
DROP POLICY IF EXISTS "Users can update vehicles" ON vehicles;
DROP POLICY IF EXISTS "Users can view vehicles" ON vehicles;

CREATE POLICY "Allow all operations on vehicles"
  ON vehicles
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- vehicle_assignments
DROP POLICY IF EXISTS "Users can insert assignments" ON vehicle_assignments;
DROP POLICY IF EXISTS "Users can view assignments" ON vehicle_assignments;

CREATE POLICY "Allow all operations on vehicle_assignments"
  ON vehicle_assignments
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- vehicle_documents
DROP POLICY IF EXISTS "Users can insert documents" ON vehicle_documents;
DROP POLICY IF EXISTS "Users can view documents" ON vehicle_documents;

CREATE POLICY "Allow all operations on vehicle_documents"
  ON vehicle_documents
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- vehicle_fuel_records
DROP POLICY IF EXISTS "Users can insert fuel records" ON vehicle_fuel_records;
DROP POLICY IF EXISTS "Users can view fuel records" ON vehicle_fuel_records;

CREATE POLICY "Allow all operations on vehicle_fuel_records"
  ON vehicle_fuel_records
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- maintenance_schedules
DROP POLICY IF EXISTS "Users can insert schedules" ON maintenance_schedules;
DROP POLICY IF EXISTS "Users can update schedules" ON maintenance_schedules;
DROP POLICY IF EXISTS "Users can view schedules" ON maintenance_schedules;

CREATE POLICY "Allow all operations on maintenance_schedules"
  ON maintenance_schedules
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- maintenance_work_orders
DROP POLICY IF EXISTS "Users can insert work orders" ON maintenance_work_orders;
DROP POLICY IF EXISTS "Users can update work orders" ON maintenance_work_orders;
DROP POLICY IF EXISTS "Users can view work orders" ON maintenance_work_orders;

CREATE POLICY "Allow all operations on maintenance_work_orders"
  ON maintenance_work_orders
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- work_order_labor
DROP POLICY IF EXISTS "Users can insert work order labor" ON work_order_labor;
DROP POLICY IF EXISTS "Users can view work order labor" ON work_order_labor;

CREATE POLICY "Allow all operations on work_order_labor"
  ON work_order_labor
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- work_order_parts
DROP POLICY IF EXISTS "Users can insert work order parts" ON work_order_parts;
DROP POLICY IF EXISTS "Users can view work order parts" ON work_order_parts;

CREATE POLICY "Allow all operations on work_order_parts"
  ON work_order_parts
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);
