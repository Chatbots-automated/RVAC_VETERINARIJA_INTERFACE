-- Add default_location_type column to equipment_products
ALTER TABLE equipment_products 
ADD COLUMN IF NOT EXISTS default_location_type text DEFAULT 'warehouse' CHECK (default_location_type IN ('farm', 'warehouse'));

-- Add comment to explain the column
COMMENT ON COLUMN equipment_products.default_location_type IS 'Default location type for this product: farm or warehouse. Used primarily for Drabužiai and API categories.';

-- Update existing products to have a default value
UPDATE equipment_products 
SET default_location_type = 'warehouse' 
WHERE default_location_type IS NULL;
