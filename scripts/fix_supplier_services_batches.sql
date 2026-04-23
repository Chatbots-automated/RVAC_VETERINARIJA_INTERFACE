-- =====================================================================
-- Fix Supplier Services Batches
-- =====================================================================
-- Created: 2026-04-23
-- Description:
--   Creates batches for supplier_services invoice items that don't 
--   have batches yet. This happens when invoices were allocated before
--   the supplier_services batch creation logic was added.
-- =====================================================================

-- Find invoice items without batches for supplier_services
WITH items_without_batches AS (
  SELECT 
    ii.id AS invoice_item_id,
    ii.invoice_id,
    ii.product_id,
    ii.quantity,
    ii.unit_price,
    i.farm_id,
    i.supplier_id,
    i.invoice_number,
    i.invoice_date,
    p.category
  FROM invoice_items ii
  JOIN invoices i ON ii.invoice_id = i.id
  JOIN products p ON ii.product_id = p.id
  WHERE ii.batch_id IS NULL 
    AND ii.warehouse_batch_id IS NULL
    AND i.farm_id IS NOT NULL  -- Invoice is already allocated to a farm
    AND p.category = 'supplier_services'
)
-- Create batches for these items
INSERT INTO batches (
  farm_id,
  product_id,
  lot,
  mfg_date,
  expiry_date,
  received_qty,
  qty_left,
  status,
  purchase_price,
  currency,
  supplier_id,
  doc_number,
  doc_date,
  invoice_id
)
SELECT 
  farm_id,
  product_id,
  NULL AS lot,
  NULL AS mfg_date,
  NULL AS expiry_date,
  quantity AS received_qty,
  quantity AS qty_left,
  'active' AS status,
  unit_price AS purchase_price,
  'EUR' AS currency,
  supplier_id,
  invoice_number AS doc_number,
  invoice_date AS doc_date,
  invoice_id
FROM items_without_batches
RETURNING id, product_id, invoice_id;

-- Now link the invoice_items to the newly created batches
-- (This needs to be done manually or in a transaction since we can't reference RETURNING in UPDATE)

-- Manual approach: Run this query to see which items need updating
SELECT 
  ii.id AS invoice_item_id,
  b.id AS batch_id,
  p.name AS product_name
FROM invoice_items ii
JOIN invoices i ON ii.invoice_id = i.id
JOIN products p ON ii.product_id = p.id
LEFT JOIN batches b ON b.invoice_id = ii.invoice_id AND b.product_id = ii.product_id
WHERE ii.batch_id IS NULL 
  AND ii.warehouse_batch_id IS NULL
  AND i.farm_id IS NOT NULL
  AND p.category = 'supplier_services'
  AND b.id IS NOT NULL;

-- Then update invoice_items with the batch_id
-- Note: You may need to run this multiple times if there are multiple items per product
UPDATE invoice_items ii
SET batch_id = b.id
FROM batches b
JOIN products p ON b.product_id = p.id
JOIN invoices i ON b.invoice_id = i.id
WHERE ii.batch_id IS NULL 
  AND ii.warehouse_batch_id IS NULL
  AND ii.product_id = b.product_id
  AND ii.invoice_id = b.invoice_id
  AND i.farm_id IS NOT NULL
  AND p.category = 'supplier_services';
