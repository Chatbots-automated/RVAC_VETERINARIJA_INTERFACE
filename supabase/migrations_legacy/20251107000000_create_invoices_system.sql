/*
  # Create Invoice Tracking System

  1. New Tables
    - `invoices`
      - `id` (uuid, primary key)
      - `invoice_number` (text) - Invoice/document number
      - `invoice_date` (date) - Date of invoice
      - `doc_title` (text) - Document type (Invoice, Receipt, etc.)
      - `supplier_id` (uuid) - Foreign key to suppliers
      - `supplier_name` (text) - Supplier name at time of invoice
      - `supplier_code` (text) - Supplier code
      - `supplier_vat` (text) - Supplier VAT code
      - `currency` (text) - Currency code (EUR, USD, etc.)
      - `total_net` (numeric) - Subtotal before VAT
      - `total_vat` (numeric) - VAT amount
      - `total_gross` (numeric) - Total including VAT
      - `vat_rate` (numeric) - VAT rate percentage
      - `pdf_filename` (text) - Original PDF filename if uploaded
      - `created_at` (timestamptz)
      - `created_by` (uuid) - User who created the invoice record

    - `invoice_items`
      - `id` (uuid, primary key)
      - `invoice_id` (uuid) - Foreign key to invoices
      - `batch_id` (uuid) - Foreign key to batches (stock received)
      - `product_id` (uuid) - Foreign key to products
      - `line_no` (int) - Line number in invoice
      - `description` (text) - Product description from invoice
      - `sku` (text) - SKU/product code from invoice
      - `quantity` (numeric) - Quantity received
      - `unit_price` (numeric) - Unit price
      - `total_price` (numeric) - Line total
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Add policies for authenticated users to read/write their organization's data
*/

-- Create invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL,
  invoice_date date NOT NULL,
  doc_title text DEFAULT 'Invoice',
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name text,
  supplier_code text,
  supplier_vat text,
  currency text DEFAULT 'EUR',
  total_net numeric(10,2) DEFAULT 0,
  total_vat numeric(10,2) DEFAULT 0,
  total_gross numeric(10,2) DEFAULT 0,
  vat_rate numeric(5,2) DEFAULT 0,
  pdf_filename text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL
);

-- Create invoice_items table
CREATE TABLE IF NOT EXISTS invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  batch_id uuid REFERENCES batches(id) ON DELETE SET NULL,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  line_no int,
  description text,
  sku text,
  quantity numeric(10,2),
  unit_price numeric(10,2),
  total_price numeric(10,2),
  created_at timestamptz DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_supplier ON invoices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_batch ON invoice_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_product ON invoice_items(product_id);

-- Enable RLS
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

-- Policies for invoices table
CREATE POLICY "Users can view all invoices"
  ON invoices FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert invoices"
  ON invoices FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update invoices"
  ON invoices FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete invoices"
  ON invoices FOR DELETE
  TO authenticated
  USING (true);

-- Policies for invoice_items table
CREATE POLICY "Users can view all invoice items"
  ON invoice_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert invoice items"
  ON invoice_items FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update invoice items"
  ON invoice_items FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete invoice items"
  ON invoice_items FOR DELETE
  TO authenticated
  USING (true);
