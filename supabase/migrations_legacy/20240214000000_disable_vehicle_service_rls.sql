-- Disable RLS on vehicle service tables
-- This allows vehicle service operations without RLS restrictions

-- Disable RLS on vehicle_service_visits
ALTER TABLE public.vehicle_service_visits DISABLE ROW LEVEL SECURITY;

-- Disable RLS on vehicle_visit_parts
ALTER TABLE public.vehicle_visit_parts DISABLE ROW LEVEL SECURITY;

-- Drop existing policies (optional, but cleaner)
DROP POLICY IF EXISTS "Users can create service visits" ON public.vehicle_service_visits;
DROP POLICY IF EXISTS "Users can delete service visits" ON public.vehicle_service_visits;
DROP POLICY IF EXISTS "Users can update service visits" ON public.vehicle_service_visits;
DROP POLICY IF EXISTS "Users can view service visits" ON public.vehicle_service_visits;

DROP POLICY IF EXISTS "Users can create visit parts" ON public.vehicle_visit_parts;
DROP POLICY IF EXISTS "Users can delete visit parts" ON public.vehicle_visit_parts;
DROP POLICY IF EXISTS "Users can update visit parts" ON public.vehicle_visit_parts;
DROP POLICY IF EXISTS "Users can view visit parts" ON public.vehicle_visit_parts;
