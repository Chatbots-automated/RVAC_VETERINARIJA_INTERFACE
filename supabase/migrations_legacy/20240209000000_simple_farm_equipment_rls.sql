-- Simple, fully permissive RLS policies for farm_equipment tables
-- This replaces complex policies with simple ones that allow all authenticated users full access

-- Drop all existing policies
DROP POLICY IF EXISTS "Users can view farm equipment" ON public.farm_equipment;
DROP POLICY IF EXISTS "Users can insert farm equipment" ON public.farm_equipment;
DROP POLICY IF EXISTS "Users can update farm equipment" ON public.farm_equipment;
DROP POLICY IF EXISTS "Users can delete farm equipment" ON public.farm_equipment;

DROP POLICY IF EXISTS "Users can view farm equipment items" ON public.farm_equipment_items;
DROP POLICY IF EXISTS "Users can insert farm equipment items" ON public.farm_equipment_items;
DROP POLICY IF EXISTS "Users can update farm equipment items" ON public.farm_equipment_items;
DROP POLICY IF EXISTS "Users can delete farm equipment items" ON public.farm_equipment_items;

DROP POLICY IF EXISTS "Users can view service records" ON public.farm_equipment_service_records;
DROP POLICY IF EXISTS "Users can insert service records" ON public.farm_equipment_service_records;
DROP POLICY IF EXISTS "Users can update service records" ON public.farm_equipment_service_records;
DROP POLICY IF EXISTS "Users can delete service records" ON public.farm_equipment_service_records;

DROP POLICY IF EXISTS "Users can view service parts" ON public.farm_equipment_service_parts;
DROP POLICY IF EXISTS "Users can insert service parts" ON public.farm_equipment_service_parts;
DROP POLICY IF EXISTS "Users can update service parts" ON public.farm_equipment_service_parts;
DROP POLICY IF EXISTS "Users can delete service parts" ON public.farm_equipment_service_parts;

-- Ensure RLS is enabled
ALTER TABLE public.farm_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farm_equipment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farm_equipment_service_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farm_equipment_service_parts ENABLE ROW LEVEL SECURITY;

-- Create simple, permissive policies
-- All authenticated users can do everything

CREATE POLICY "Enable all for authenticated users" ON public.farm_equipment
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Enable all for authenticated users" ON public.farm_equipment_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Enable all for authenticated users" ON public.farm_equipment_service_records
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Enable all for authenticated users" ON public.farm_equipment_service_parts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Grant full permissions
GRANT ALL ON public.farm_equipment TO authenticated, service_role;
GRANT ALL ON public.farm_equipment_items TO authenticated, service_role;
GRANT ALL ON public.farm_equipment_service_records TO authenticated, service_role;
GRANT ALL ON public.farm_equipment_service_parts TO authenticated, service_role;
GRANT SELECT ON public.farm_equipment_summary TO authenticated, service_role;
GRANT SELECT ON public.farm_equipment_items_detail TO authenticated, service_role;
