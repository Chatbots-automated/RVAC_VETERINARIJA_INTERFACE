/*
  # Fix Equipment RLS and Translate Categories

  1. Changes
    - Disable RLS on equipment_products table to match other tables in the app
    - Translate equipment category names to Lithuanian
    - Remove English-only categories and add proper Lithuanian categories

  2. Notes
    - This app uses custom authentication, not Supabase Auth
    - All other tables (products, treatments, animals) have RLS disabled
    - Equipment tables should follow the same pattern
*/

-- Disable RLS on equipment_products to match the rest of the app
ALTER TABLE equipment_products DISABLE ROW LEVEL SECURITY;

-- Drop all RLS policies since they're no longer needed
DROP POLICY IF EXISTS "Authenticated users can view equipment products" ON equipment_products;
DROP POLICY IF EXISTS "Authenticated users can insert equipment products" ON equipment_products;
DROP POLICY IF EXISTS "Authenticated users can update equipment products" ON equipment_products;
DROP POLICY IF EXISTS "Authenticated users can delete equipment products" ON equipment_products;
DROP POLICY IF EXISTS "Users can view products" ON equipment_products;
DROP POLICY IF EXISTS "Users can insert products" ON equipment_products;
DROP POLICY IF EXISTS "Users can update products" ON equipment_products;

DROP POLICY IF EXISTS "Authenticated users can view equipment categories" ON equipment_categories;
DROP POLICY IF EXISTS "Authenticated users can insert equipment categories" ON equipment_categories;
DROP POLICY IF EXISTS "Authenticated users can update equipment categories" ON equipment_categories;
DROP POLICY IF EXISTS "Authenticated users can delete equipment categories" ON equipment_categories;
DROP POLICY IF EXISTS "Users can view categories" ON equipment_categories;

-- Delete English-only categories
DELETE FROM equipment_categories 
WHERE name IN ('Electrical', 'Filters', 'Fluids', 'Other', 'Parts', 'PPE', 'Tires', 'Tools');

-- Update existing Lithuanian categories to ensure consistency
UPDATE equipment_categories SET name = 'Įrankiai', description = 'Darbo įrankiai ir prietaisai' WHERE name = 'Įrankiai';
UPDATE equipment_categories SET name = 'Drabužiai ir APĮ', description = 'Darbo drabužiai ir asmeninės apsaugos priemonės' WHERE name = 'Drabužiai';
UPDATE equipment_categories SET name = 'Transporto priemonės', description = 'Automobiliai, traktoriai ir kita technika' WHERE name = 'Transportas';
UPDATE equipment_categories SET name = 'Atsarginės dalys', description = 'Įrangos ir transporto atsarginės dalys' WHERE name = 'Atsarginės dalys';
UPDATE equipment_categories SET name = 'Degalai ir tepalai', description = 'Kuras, alyvos ir kitos skysčiai' WHERE name = 'Kuro produktai';
UPDATE equipment_categories SET name = 'Kita įranga', description = 'Kita įranga ir reikmenys' WHERE name = 'Kita įranga';
