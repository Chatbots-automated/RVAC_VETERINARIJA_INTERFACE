/*
  # Fix Invoices Table Schema

  1. Changes
    - Add missing columns to invoices table:
      - supplier_name (text) - Supplier name at time of invoice
      - supplier_code (text) - Supplier code
      - supplier_vat (text) - Supplier VAT code
      - total_net (numeric) - Subtotal before VAT
      - total_vat (numeric) - VAT amount
      - total_gross (numeric) - Total including VAT
      - vat_rate (numeric) - VAT rate percentage
      - pdf_filename (text) - Original PDF filename
      - created_by (uuid) - User who created the invoice
    - Rename total_amount to match schema if needed
    - Keep existing columns: id, invoice_number, invoice_date, supplier_id, currency, notes, created_at, doc_title

  2. Notes
    - Uses IF NOT EXISTS to avoid errors if columns already exist
    - Preserves existing data
*/

-- Add missing columns to invoices table
DO $$
BEGIN
  -- Add supplier_name if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'supplier_name'
  ) THEN
    ALTER TABLE invoices ADD COLUMN supplier_name text;
  END IF;

  -- Add supplier_code if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'supplier_code'
  ) THEN
    ALTER TABLE invoices ADD COLUMN supplier_code text;
  END IF;

  -- Add supplier_vat if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'supplier_vat'
  ) THEN
    ALTER TABLE invoices ADD COLUMN supplier_vat text;
  END IF;

  -- Add total_net if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'total_net'
  ) THEN
    ALTER TABLE invoices ADD COLUMN total_net numeric(10,2) DEFAULT 0;
  END IF;

  -- Add total_vat if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'total_vat'
  ) THEN
    ALTER TABLE invoices ADD COLUMN total_vat numeric(10,2) DEFAULT 0;
  END IF;

  -- Add total_gross if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'total_gross'
  ) THEN
    ALTER TABLE invoices ADD COLUMN total_gross numeric(10,2) DEFAULT 0;
  END IF;

  -- Add vat_rate if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'vat_rate'
  ) THEN
    ALTER TABLE invoices ADD COLUMN vat_rate numeric(5,2) DEFAULT 0;
  END IF;

  -- Add pdf_filename if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'pdf_filename'
  ) THEN
    ALTER TABLE invoices ADD COLUMN pdf_filename text;
  END IF;

  -- Add created_by if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'created_by'
  ) THEN
    ALTER TABLE invoices ADD COLUMN created_by uuid REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_supplier ON invoices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);
