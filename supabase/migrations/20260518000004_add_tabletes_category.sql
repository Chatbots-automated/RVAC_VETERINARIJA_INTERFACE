-- =====================================================================
-- Add 'tabletės' Product Category
-- =====================================================================
-- Adds tablets as a product category (like 'bolusas' and 'svirkstukai')
-- =====================================================================

-- Add the new category to the enum
ALTER TYPE product_category ADD VALUE IF NOT EXISTS 'tabletės';

-- Add comment
COMMENT ON TYPE product_category IS 
'Product categories including tabletės for tablet-based medications';
