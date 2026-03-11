-- Disable RLS on all farm_equipment tables
-- This allows full access without RLS policy restrictions

ALTER TABLE public.farm_equipment DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.farm_equipment_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.farm_equipment_service_records DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.farm_equipment_service_parts DISABLE ROW LEVEL SECURITY;

-- Grant permissions to ensure access
GRANT ALL ON public.farm_equipment TO authenticated, service_role, anon;
GRANT ALL ON public.farm_equipment_items TO authenticated, service_role, anon;
GRANT ALL ON public.farm_equipment_service_records TO authenticated, service_role, anon;
GRANT ALL ON public.farm_equipment_service_parts TO authenticated, service_role, anon;
GRANT SELECT ON public.farm_equipment_summary TO authenticated, service_role, anon;
GRANT SELECT ON public.farm_equipment_items_detail TO authenticated, service_role, anon;
