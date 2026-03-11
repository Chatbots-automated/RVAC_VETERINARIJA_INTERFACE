/*
  # Fix maintenance_work_orders foreign key constraints

  1. Problem
    - created_by and assigned_to reference auth.users(id)
    - This app uses custom authentication (public.users), not Supabase Auth
    - Causes foreign key constraint violations on insert/update

  2. Solution
    - Drop existing foreign key constraints to auth.users
    - Add new foreign key constraints to public.users
    - Make constraints optional (allow NULL values)
*/

-- Drop existing foreign key constraints
ALTER TABLE maintenance_work_orders 
DROP CONSTRAINT IF EXISTS maintenance_work_orders_created_by_fkey;

ALTER TABLE maintenance_work_orders 
DROP CONSTRAINT IF EXISTS maintenance_work_orders_assigned_to_fkey;

-- Add new foreign key constraints to public.users (not auth.users)
ALTER TABLE maintenance_work_orders 
ADD CONSTRAINT maintenance_work_orders_created_by_fkey 
FOREIGN KEY (created_by) REFERENCES users(id);

ALTER TABLE maintenance_work_orders 
ADD CONSTRAINT maintenance_work_orders_assigned_to_fkey 
FOREIGN KEY (assigned_to) REFERENCES users(id);
