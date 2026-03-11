-- Create views for vehicle maintenance cost reporting
-- This provides comprehensive cost analysis for all vehicle maintenance activities

-- View 1: Vehicle maintenance cost summary (per vehicle)
CREATE OR REPLACE VIEW public.vehicle_maintenance_cost_summary AS
SELECT 
  v.id as vehicle_id,
  v.registration_number,
  v.make,
  v.model,
  v.year,
  v.vin,
  
  -- Work order statistics
  COUNT(DISTINCT mwo.id) FILTER (WHERE mwo.status = 'completed') as completed_work_orders,
  COALESCE(SUM(mwo.labor_cost) FILTER (WHERE mwo.status = 'completed'), 0) as total_labor_cost,
  COALESCE(SUM(mwo.parts_cost) FILTER (WHERE mwo.status = 'completed'), 0) as total_work_order_parts_cost,
  COALESCE(SUM(mwo.total_cost) FILTER (WHERE mwo.status = 'completed'), 0) as total_work_order_cost,
  
  -- Service visit statistics
  COUNT(DISTINCT vsv.id) FILTER (WHERE vsv.status = 'Baigtas') as completed_service_visits,
  COALESCE(SUM(vsv.actual_cost) FILTER (WHERE vsv.status = 'Baigtas'), 0) as total_service_cost,
  
  -- Parts statistics from work orders
  COUNT(DISTINCT wop.id) as total_work_order_parts,
  COALESCE(SUM(wop.total_price), 0) as work_order_parts_value,
  
  -- Parts statistics from service visits
  COUNT(DISTINCT vvp.id) as total_visit_parts,
  COALESCE(SUM(vvp.quantity_used * COALESCE(vvp.cost_per_unit, 0)), 0) as visit_parts_value,
  
  -- Combined totals
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

-- View 2: Detailed work order history with parts
CREATE OR REPLACE VIEW public.vehicle_work_order_details AS
SELECT 
  mwo.id as work_order_id,
  mwo.work_order_number,
  mwo.vehicle_id,
  v.registration_number,
  v.make,
  v.model,
  mwo.description,
  mwo.status,
  mwo.priority,
  mwo.assigned_to,
  mwo.scheduled_date,
  mwo.started_date,
  mwo.completed_date,
  mwo.labor_hours,
  mwo.labor_cost,
  mwo.parts_cost,
  mwo.total_cost,
  mwo.odometer_reading,
  mwo.engine_hours,
  mwo.notes,
  
  -- Parts details (aggregated)
  json_agg(
    json_build_object(
      'part_id', wop.id,
      'product_id', wop.product_id,
      'product_name', ep.name,
      'product_code', ep.product_code,
      'batch_id', wop.batch_id,
      'batch_number', eb.batch_number,
      'quantity', wop.quantity,
      'unit_price', wop.unit_price,
      'total_price', wop.total_price,
      'invoice_number', ei.invoice_number,
      'supplier_name', ei.supplier_name,
      'notes', wop.notes
    ) ORDER BY wop.created_at
  ) FILTER (WHERE wop.id IS NOT NULL) as parts_used

FROM public.maintenance_work_orders mwo
JOIN public.vehicles v ON mwo.vehicle_id = v.id
LEFT JOIN public.work_order_parts wop ON mwo.id = wop.work_order_id
LEFT JOIN public.equipment_products ep ON wop.product_id = ep.id
LEFT JOIN public.equipment_batches eb ON wop.batch_id = eb.id
LEFT JOIN public.equipment_invoices ei ON eb.invoice_id = ei.id
GROUP BY mwo.id, mwo.work_order_number, mwo.vehicle_id, v.registration_number, v.make, v.model,
  mwo.description, mwo.status, mwo.priority, mwo.assigned_to, mwo.scheduled_date,
  mwo.started_date, mwo.completed_date, mwo.labor_hours, mwo.labor_cost,
  mwo.parts_cost, mwo.total_cost, mwo.odometer_reading, mwo.engine_hours, mwo.notes;

-- View 3: Detailed service visit history with parts
CREATE OR REPLACE VIEW public.vehicle_service_visit_details AS
SELECT 
  vsv.id as visit_id,
  vsv.vehicle_id,
  v.registration_number,
  v.make,
  v.model,
  vsv.visit_datetime,
  vsv.visit_type,
  vsv.procedures,
  vsv.status,
  vsv.odometer_reading,
  vsv.engine_hours,
  vsv.mechanic_name,
  vsv.labor_hours,
  vsv.actual_cost,
  vsv.notes,
  
  -- Parts details (aggregated)
  json_agg(
    json_build_object(
      'part_id', vvp.id,
      'product_id', vvp.product_id,
      'product_name', p.name,
      'batch_id', vvp.batch_id,
      'quantity_used', vvp.quantity_used,
      'cost_per_unit', vvp.cost_per_unit,
      'total_cost', vvp.quantity_used * COALESCE(vvp.cost_per_unit, 0),
      'notes', vvp.notes
    ) ORDER BY vvp.created_at
  ) FILTER (WHERE vvp.id IS NOT NULL) as parts_used

FROM public.vehicle_service_visits vsv
JOIN public.vehicles v ON vsv.vehicle_id = v.id
LEFT JOIN public.vehicle_visit_parts vvp ON vsv.id = vvp.visit_id
LEFT JOIN public.products p ON vvp.product_id = p.id
GROUP BY vsv.id, vsv.vehicle_id, v.registration_number, v.make, v.model,
  vsv.visit_datetime, vsv.visit_type, vsv.procedures, vsv.status,
  vsv.odometer_reading, vsv.engine_hours, vsv.mechanic_name,
  vsv.labor_hours, vsv.actual_cost, vsv.notes;

-- View 4: Vehicle cost overview (top-level stats)
CREATE OR REPLACE VIEW public.vehicle_cost_overview AS
SELECT 
  COUNT(DISTINCT vehicle_id) as total_vehicles,
  COUNT(DISTINCT vehicle_id) FILTER (WHERE total_completed_activities > 0) as vehicles_with_maintenance,
  SUM(completed_work_orders) as total_work_orders,
  SUM(completed_service_visits) as total_service_visits,
  SUM(total_parts_used) as total_parts,
  SUM(grand_total_cost) as total_cost,
  AVG(grand_total_cost) FILTER (WHERE total_completed_activities > 0) as avg_cost_per_vehicle,
  SUM(total_labor_cost) as total_labor,
  SUM(work_order_parts_value + visit_parts_value) as total_parts_cost
FROM public.vehicle_maintenance_cost_summary;

-- Grant permissions
GRANT SELECT ON public.vehicle_maintenance_cost_summary TO authenticated, service_role, anon;
GRANT SELECT ON public.vehicle_work_order_details TO authenticated, service_role, anon;
GRANT SELECT ON public.vehicle_service_visit_details TO authenticated, service_role, anon;
GRANT SELECT ON public.vehicle_cost_overview TO authenticated, service_role, anon;
