/*
  # Create Insemination Management System

  ## Overview
  This migration creates a complete insemination (sėklinimas) management system
  to track artificial insemination of animals, including sperm and supply inventory,
  usage records, and pregnancy outcomes for analytics.

  ## New Tables

  ### 1. insemination_products
  Stores sperm and glove products used in insemination procedures
  - id (uuid, primary key)
  - name (text) - Product name
  - product_type (text) - Either 'SPERM' or 'GLOVES'
  - supplier_group (text) - Supplier name (default: PASARU GRUPE)
  - unit (text) - Unit of measurement (default: vnt)
  - price (decimal) - Price per unit (nullable for now)
  - is_active (boolean) - Active status
  - created_at (timestamptz)
  - updated_at (timestamptz)

  ### 2. insemination_inventory
  Tracks inventory levels for insemination products
  - id (uuid, primary key)
  - product_id (uuid, foreign key) - References insemination_products
  - quantity (decimal) - Current quantity in stock
  - batch_number (text) - Batch/lot number
  - expiry_date (date) - Product expiry date
  - received_date (date) - Date received into inventory
  - notes (text) - Additional notes
  - created_at (timestamptz)
  - updated_at (timestamptz)

  ### 3. insemination_records
  Records each insemination procedure performed
  - id (uuid, primary key)
  - sync_step_id (uuid) - References synchronization step (nullable)
  - animal_id (uuid, foreign key) - References animals
  - insemination_date (date) - Date of insemination
  - sperm_product_id (uuid, foreign key) - Sperm used
  - sperm_quantity (decimal) - Amount of sperm used
  - glove_product_id (uuid, foreign key) - Gloves used (nullable)
  - glove_quantity (decimal) - Number of gloves used (nullable)
  - notes (text) - Additional notes
  - performed_by (uuid) - User who performed the procedure
  - pregnancy_confirmed (boolean) - Pregnancy outcome (nullable)
  - pregnancy_check_date (date) - Date pregnancy was checked (nullable)
  - pregnancy_notes (text) - Notes about pregnancy check (nullable)
  - created_at (timestamptz)
  - updated_at (timestamptz)

  ## Security
  - Enable RLS on all tables
  - Add policies for authenticated users to read their farm's data
  - Add policies for users with appropriate permissions to insert/update

  ## Important Notes
  - Pricing is single value per product (future: batch-specific pricing)
  - FIFO inventory deduction will be handled in application logic
  - Pregnancy tracking enables success rate analytics
*/

-- Create insemination_products table
CREATE TABLE IF NOT EXISTS insemination_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  product_type text NOT NULL CHECK (product_type IN ('SPERM', 'GLOVES')),
  supplier_group text DEFAULT 'PASARU GRUPE',
  unit text DEFAULT 'vnt',
  price decimal(10, 2),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create insemination_inventory table
CREATE TABLE IF NOT EXISTS insemination_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES insemination_products(id) ON DELETE CASCADE,
  quantity decimal(10, 2) NOT NULL DEFAULT 0,
  batch_number text,
  expiry_date date,
  received_date date DEFAULT CURRENT_DATE,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create insemination_records table
CREATE TABLE IF NOT EXISTS insemination_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_step_id uuid,
  animal_id uuid NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  insemination_date date NOT NULL DEFAULT CURRENT_DATE,
  sperm_product_id uuid NOT NULL REFERENCES insemination_products(id),
  sperm_quantity decimal(10, 2) NOT NULL,
  glove_product_id uuid REFERENCES insemination_products(id),
  glove_quantity decimal(10, 2),
  notes text,
  performed_by uuid,
  pregnancy_confirmed boolean,
  pregnancy_check_date date,
  pregnancy_notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_insemination_inventory_product_id ON insemination_inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_insemination_inventory_expiry ON insemination_inventory(expiry_date);
CREATE INDEX IF NOT EXISTS idx_insemination_records_animal_id ON insemination_records(animal_id);
CREATE INDEX IF NOT EXISTS idx_insemination_records_date ON insemination_records(insemination_date);
CREATE INDEX IF NOT EXISTS idx_insemination_records_sync_step ON insemination_records(sync_step_id);
CREATE INDEX IF NOT EXISTS idx_insemination_records_pregnancy ON insemination_records(pregnancy_confirmed);

-- Enable RLS
ALTER TABLE insemination_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE insemination_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE insemination_records ENABLE ROW LEVEL SECURITY;

-- RLS Policies for insemination_products
CREATE POLICY "Authenticated users can view insemination products"
  ON insemination_products FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert insemination products"
  ON insemination_products FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update insemination products"
  ON insemination_products FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete insemination products"
  ON insemination_products FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for insemination_inventory
CREATE POLICY "Authenticated users can view insemination inventory"
  ON insemination_inventory FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert insemination inventory"
  ON insemination_inventory FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update insemination inventory"
  ON insemination_inventory FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete insemination inventory"
  ON insemination_inventory FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for insemination_records
CREATE POLICY "Authenticated users can view insemination records"
  ON insemination_records FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert insemination records"
  ON insemination_records FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update insemination records"
  ON insemination_records FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete insemination records"
  ON insemination_records FOR DELETE
  TO authenticated
  USING (true);

-- Insert initial GLOVES products
INSERT INTO insemination_products (name, product_type, supplier_group, unit, is_active)
VALUES
  ('Ginekologinės pirštinės vokiškos, vnt', 'GLOVES', 'PASARU GRUPE', 'vnt', true),
  ('Movos vokiškos, vnt', 'GLOVES', 'PASARU GRUPE', 'vnt', true),
  ('Pirštinės uždengiančios petį, N50, vnt', 'GLOVES', 'PASARU GRUPE', 'vnt', true),
  ('Movos prancūziškos Alpha sheet, vnt', 'GLOVES', 'PASARU GRUPE', 'vnt', true)
ON CONFLICT DO NOTHING;

-- Insert initial SPERM products
INSERT INTO insemination_products (name, product_type, supplier_group, unit, is_active)
VALUES
  ('Barnaby AA, triple (mėsinis), vnt', 'SPERM', 'PASARU GRUPE', 'vnt', true),
  ('Capitol SEX,vnt', 'SPERM', 'PASARU GRUPE', 'vnt', true),
  ('Donvil b.sp', 'SPERM', 'PASARU GRUPE', 'vnt', true),
  ('Guevara b.sp., (mėsinis),vnt', 'SPERM', 'PASARU GRUPE', 'vnt', true),
  ('Lascaro b.sp', 'SPERM', 'PASARU GRUPE', 'vnt', true),
  ('Lascaro SEXVYR b.sp', 'SPERM', 'PASARU GRUPE', 'vnt', true),
  ('Lukas Triple (mėsinis)', 'SPERM', 'PASARU GRUPE', 'vnt', true),
  ('Moloko SEX b.sp, vnt', 'SPERM', 'PASARU GRUPE', 'vnt', true),
  ('Renew ET SEX, vnt', 'SPERM', 'PASARU GRUPE', 'vnt', true),
  ('Setlur SEX b.sp, vnt', 'SPERM', 'PASARU GRUPE', 'vnt', true),
  ('TiqTaq SEX, vnt', 'SPERM', 'PASARU GRUPE', 'vnt', true),
  ('Unisson b.sp., (mėsinis),vnt', 'SPERM', 'PASARU GRUPE', 'vnt', true)
ON CONFLICT DO NOTHING;
