-- Fix vehicle maintenance cost views to use correct status values
-- Work orders use 'completed' (English), not 'Užbaigta' (Lithuanian)

-- View 1: Vehicle maintenance cost summary (per vehicle) - FIXED
CREATE OR REPLACE VIEW public.vehicle_maintenance_cost_summary AS
SELECT 
  v.id as vehicle_id,
  v.registration_number,
  v.make,
  v.model,
  v.year,
  v.vin,
  
  -- Work order statistics (FIXED: 'completed' instead of 'Užbaigta')
  COUNT(DISTINCT mwo.id) FILTER (WHERE mwo.status = 'completed') as completed_work_orders,
  COALESCE(SUM(mwo.labor_cost) FILTER (WHERE mwo.status = 'completed'), 0) as total_labor_cost,
  COALESCE(SUM(mwo.parts_cost) FILTER (WHERE mwo.status = 'completed'), 0) as total_work_order_parts_cost,
  COALESCE(SUM(mwo.total_cost) FILTER (WHERE mwo.status = 'completed'), 0) as total_work_order_cost,
  
  -- Service visit statistics (correct: 'Baigtas' in Lithuanian)
  COUNT(DISTINCT vsv.id) FILTER (WHERE vsv.status = 'Baigtas') as completed_service_visits,
  COALESCE(SUM(vsv.actual_cost) FILTER (WHERE vsv.status = 'Baigtas'), 0) as total_service_cost,
  
  -- Parts statistics from work orders
  COUNT(DISTINCT wop.id) as total_work_order_parts,
  COALESCE(SUM(wop.total_price), 0) as work_order_parts_value,
  
  -- Parts statistics from service visits
  COUNT(DISTINCT vvp.id) as total_visit_parts,
  COALESCE(SUM(vvp.quantity_used * COALESCE(vvp.cost_per_unit, 0)), 0) as visit_parts_value,
  
  -- Combined totals (FIXED: 'completed' for work orders)
  COUNT(DISTINCT mwo.id) FILTER (WHERE mwo.status = 'completed') + 
    COUNT(DISTINCT vsv.id) FILTER (WHERE vsv.status = 'Baigtas') as total_completed_activities,
  COUNT(DISTINCT wop.id) + COUNT(DISTINCT vvp.id) as total_parts_used,
  COALESCE(SUM(mwo.total_cost) FILTER (WHERE mwo.status = 'completed'), 0) + 
    COALESCE(SUM(vsv.actual_cost) FILTER (WHERE vsv.status = 'Baigtas'), 0) as grand_total_cost

FROM public.vehicles v
LEFT JOIN public.maintenance_work_orders mwo ON v.id = mwo.vehicle_id
LEFT JOIN public.vehicle_service_visits vsv ON v.id = vsv.vehicle_id
LEFT JOIN public.work_order_parts wop ON mwo.id = wop.work_order_id
LEFT JOIN public.vehicle_visit_parts vvp ON vsv.id = vvp.visit_id
WHERE v.is_active = true
GROUP BY v.id, v.registration_number, v.make, v.model, v.year, v.vin;
