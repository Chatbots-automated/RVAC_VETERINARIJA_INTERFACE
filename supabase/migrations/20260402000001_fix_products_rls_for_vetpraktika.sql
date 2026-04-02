-- Fix products RLS policies to allow all users to view all products
-- This is needed for the Vetpraktika module where users should see all products across all farms
-- Since we use custom auth (not Supabase Auth), auth.uid() returns NULL
-- The application handles authorization at the application level

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can view products in their farm" ON public.products;
DROP POLICY IF EXISTS "Users can manage products in their farm" ON public.products;
DROP POLICY IF EXISTS "Allow all operations on products" ON public.products;

-- Create permissive policies that work with custom auth
CREATE POLICY "Allow viewing all products"
    ON public.products FOR SELECT
    USING (true);

CREATE POLICY "Allow managing all products"
    ON public.products FOR ALL
    USING (true)
    WITH CHECK (true);

COMMENT ON POLICY "Allow viewing all products" ON public.products IS 'Allows all users to view all products across all farms (needed for Vetpraktika module). Application handles authorization.';
COMMENT ON POLICY "Allow managing all products" ON public.products IS 'Allows all users to manage products. Application handles authorization based on user role and selected farm.';
