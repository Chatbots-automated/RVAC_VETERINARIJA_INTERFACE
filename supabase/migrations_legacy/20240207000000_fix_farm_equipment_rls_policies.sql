-- Fix RLS policies for farm_equipment tables
-- Run this if you're getting RLS violations when creating equipment

-- First, drop existing policies if any
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

-- Create new policies with proper permissions
-- Farm equipment policies
CREATE POLICY "Users can view farm equipment" ON public.farm_equipment
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert farm equipment" ON public.farm_equipment
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Users can update farm equipment" ON public.farm_equipment
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Users can delete farm equipment" ON public.farm_equipment
  FOR DELETE TO authenticated USING (true);

-- Farm equipment items policies
CREATE POLICY "Users can view farm equipment items" ON public.farm_equipment_items
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert farm equipment items" ON public.farm_equipment_items
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Users can update farm equipment items" ON public.farm_equipment_items
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Users can delete farm equipment items" ON public.farm_equipment_items
  FOR DELETE TO authenticated USING (true);

-- Service records policies
CREATE POLICY "Users can view service records" ON public.farm_equipment_service_records
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert service records" ON public.farm_equipment_service_records
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Users can update service records" ON public.farm_equipment_service_records
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Users can delete service records" ON public.farm_equipment_service_records
  FOR DELETE TO authenticated USING (true);

-- Service parts policies
CREATE POLICY "Users can view service parts" ON public.farm_equipment_service_parts
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert service parts" ON public.farm_equipment_service_parts
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Users can update service parts" ON public.farm_equipment_service_parts
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Users can delete service parts" ON public.farm_equipment_service_parts
  FOR DELETE TO authenticated USING (true);

-- Grant all necessary permissions
GRANT ALL ON public.farm_equipment TO authenticated;
GRANT ALL ON public.farm_equipment_items TO authenticated;
GRANT ALL ON public.farm_equipment_service_records TO authenticated;
GRANT ALL ON public.farm_equipment_service_parts TO authenticated;
GRANT SELECT ON public.farm_equipment_summary TO authenticated;
GRANT SELECT ON public.farm_equipment_items_detail TO authenticated;

GRANT ALL ON public.farm_equipment TO service_role;
GRANT ALL ON public.farm_equipment_items TO service_role;
GRANT ALL ON public.farm_equipment_service_records TO service_role;
GRANT ALL ON public.farm_equipment_service_parts TO service_role;
GRANT SELECT ON public.farm_equipment_summary TO service_role;
GRANT SELECT ON public.farm_equipment_items_detail TO service_role;

-- Verify the policies were created
SELECT schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename LIKE 'farm_equipment%'
ORDER BY tablename, cmd;
