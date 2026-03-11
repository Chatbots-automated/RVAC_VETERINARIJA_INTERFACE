/*
  # Fix Equipment Module RLS Policies

  1. Problem
    - Equipment tables have RLS policies for `authenticated` role
    - This app uses custom authentication (public.users), not Supabase Auth
    - Users cannot insert/update equipment data due to RLS violations
    
  2. Solution
    - Drop all existing RLS policies on equipment tables
    - Create new policies for `public` role (app handles auth at application level)
    - Match pattern used in rest of app (e.g., invoices, products, animals)
    
  3. Tables Fixed
    - equipment_invoices
    - equipment_invoice_items
    - equipment_batches
    - equipment_suppliers
    - equipment_locations
    - equipment_products (enable RLS)
    - equipment_categories (enable RLS)
*/

-- equipment_invoices
DROP POLICY IF EXISTS "Users can insert invoices" ON equipment_invoices;
DROP POLICY IF EXISTS "Users can view invoices" ON equipment_invoices;

CREATE POLICY "Allow all operations on equipment_invoices"
  ON equipment_invoices
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- equipment_invoice_items
DROP POLICY IF EXISTS "Users can insert invoice items" ON equipment_invoice_items;
DROP POLICY IF EXISTS "Users can view invoice items" ON equipment_invoice_items;

CREATE POLICY "Allow all operations on equipment_invoice_items"
  ON equipment_invoice_items
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- equipment_batches
DROP POLICY IF EXISTS "Users can insert batches" ON equipment_batches;
DROP POLICY IF EXISTS "Users can update batches" ON equipment_batches;
DROP POLICY IF EXISTS "Users can view batches" ON equipment_batches;

CREATE POLICY "Allow all operations on equipment_batches"
  ON equipment_batches
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- equipment_suppliers
DROP POLICY IF EXISTS "Users can insert suppliers" ON equipment_suppliers;
DROP POLICY IF EXISTS "Users can update suppliers" ON equipment_suppliers;
DROP POLICY IF EXISTS "Users can view suppliers" ON equipment_suppliers;

CREATE POLICY "Allow all operations on equipment_suppliers"
  ON equipment_suppliers
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- equipment_locations
DROP POLICY IF EXISTS "Users can view locations" ON equipment_locations;

CREATE POLICY "Allow all operations on equipment_locations"
  ON equipment_locations
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- equipment_products (enable RLS and add policy)
ALTER TABLE equipment_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on equipment_products"
  ON equipment_products
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- equipment_categories (enable RLS and add policy)
ALTER TABLE equipment_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on equipment_categories"
  ON equipment_categories
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);
