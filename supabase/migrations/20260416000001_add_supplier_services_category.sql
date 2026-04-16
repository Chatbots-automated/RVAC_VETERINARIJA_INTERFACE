-- Migration: Add "Tiekėjo paslaugos" (Supplier Services) category
-- This category is for non-stock items like transportation costs, service fees
-- These items appear on invoices but don't create stock batches

-- Add new category to enum
ALTER TYPE product_category ADD VALUE IF NOT EXISTS 'supplier_services';

-- Comment to explain the purpose
COMMENT ON TYPE product_category IS 'Product categories including supplier_services for non-stock invoice items like transportation';

-- No changes needed to batches table - supplier_services products simply won't create batches
-- The logic will be handled in the frontend to prevent batch creation for this category
