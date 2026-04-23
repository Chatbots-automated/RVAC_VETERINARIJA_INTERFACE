-- =====================================================================
-- Fix Supplier Services Unit
-- =====================================================================
-- Created: 2026-04-23
-- Description:
--   Updates supplier_services products to have 'vnt' as primary_pack_unit
--   if they don't already have one set.
-- =====================================================================

UPDATE products
SET primary_pack_unit = 'vnt'
WHERE category = 'supplier_services'
  AND (primary_pack_unit IS NULL OR primary_pack_unit = 'ml');

-- Verify the update
SELECT id, name, category, primary_pack_unit
FROM products
WHERE category = 'supplier_services';
