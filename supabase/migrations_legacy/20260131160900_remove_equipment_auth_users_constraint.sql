/*
  # Remove Equipment Products Auth Constraint

  1. Changes
    - Drop foreign key constraint on equipment_products.created_by that references auth.users
    - This app uses custom authentication (public.users table), not Supabase Auth
    
  2. Notes
    - created_by column remains nullable and can be used for tracking
    - No foreign key enforcement since app doesn't use auth.users
*/

-- Drop the foreign key constraint that references auth.users
ALTER TABLE equipment_products 
DROP CONSTRAINT IF EXISTS equipment_products_created_by_fkey;
