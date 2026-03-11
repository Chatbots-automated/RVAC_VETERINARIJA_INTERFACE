-- Create view for farm equipment service cost analysis
-- This aggregates all service records with parts used and costs

CREATE OR REPLACE VIEW public.farm_equipment_service_cost_summary AS
SELECT 
  fe.id as equipment_id,
  fe.name as equipment_name,
  fe.location as equipment_location,
  fe.category as equipment_category,
  fei.id as item_id,
  fei.item_name,
  fei.service_interval_value,
  fei.service_interval_type,
  
  -- Service counts
  COUNT(DISTINCT fsr.id) as total_services,
  MIN(fsr.service_date) as first_service_date,
  MAX(fsr.service_date) as last_service_date,
  
  -- Parts costs
  COUNT(DISTINCT fsp.id) as total_parts_used,
  COALESCE(SUM(fsp.quantity_used * fsp.unit_price), 0) as total_parts_cost,
  
  -- Latest service info
  (
    SELECT service_date 
    FROM farm_equipment_service_records 
    WHERE farm_equipment_item_id = fei.id 
    ORDER BY service_date DESC 
    LIMIT 1
  ) as latest_service_date

FROM farm_equipment fe
JOIN farm_equipment_items fei ON fei.farm_equipment_id = fe.id
LEFT JOIN farm_equipment_service_records fsr ON fsr.farm_equipment_item_id = fei.id
LEFT JOIN farm_equipment_service_parts fsp ON fsp.service_record_id = fsr.id

WHERE fe.is_active = true AND fei.is_active = true

GROUP BY 
  fe.id, fe.name, fe.location, fe.category,
  fei.id, fei.item_name, fei.service_interval_value, fei.service_interval_type

ORDER BY total_parts_cost DESC;

-- Detailed service records view with parts
CREATE OR REPLACE VIEW public.farm_equipment_service_details AS
SELECT 
  fsr.id as service_record_id,
  fsr.service_date,
  fsr.notes as service_notes,
  
  fe.id as equipment_id,
  fe.name as equipment_name,
  fe.location as equipment_location,
  fe.category as equipment_category,
  
  fei.id as item_id,
  fei.item_name,
  
  fsp.id as part_id,
  ep.name as product_name,
  ep.product_code,
  ep.unit_type,
  fsp.quantity_used,
  fsp.unit_price,
  (fsp.quantity_used * fsp.unit_price) as part_total_cost,
  fsp.notes as part_notes,
  
  eb.batch_number,
  
  u.full_name as performed_by_name,
  
  fsr.created_at

FROM farm_equipment_service_records fsr
JOIN farm_equipment_items fei ON fei.id = fsr.farm_equipment_item_id
JOIN farm_equipment fe ON fe.id = fei.farm_equipment_id
LEFT JOIN farm_equipment_service_parts fsp ON fsp.service_record_id = fsr.id
LEFT JOIN equipment_products ep ON ep.id = fsp.product_id
LEFT JOIN equipment_batches eb ON eb.id = fsp.batch_id
LEFT JOIN users u ON u.id = fsr.performed_by

WHERE fe.is_active = true

ORDER BY fsr.service_date DESC, fsr.created_at DESC;

-- Equipment overview for reports
CREATE OR REPLACE VIEW public.farm_equipment_cost_overview AS
SELECT 
  fe.id as equipment_id,
  fe.name as equipment_name,
  fe.location,
  fe.category,
  fe.description,
  
  -- Item counts
  COUNT(DISTINCT fei.id) as total_items,
  COUNT(DISTINCT fei.id) FILTER (WHERE fei.is_active = true) as active_items,
  
  -- Service counts
  COUNT(DISTINCT fsr.id) as total_services,
  
  -- Parts and costs
  COUNT(DISTINCT fsp.id) as total_parts_used,
  COALESCE(SUM(fsp.quantity_used * fsp.unit_price), 0) as total_cost,
  COALESCE(AVG(fsp.quantity_used * fsp.unit_price), 0) as avg_service_cost,
  
  -- Dates
  MIN(fsr.service_date) as first_service_date,
  MAX(fsr.service_date) as last_service_date

FROM farm_equipment fe
LEFT JOIN farm_equipment_items fei ON fei.farm_equipment_id = fe.id
LEFT JOIN farm_equipment_service_records fsr ON fsr.farm_equipment_item_id = fei.id
LEFT JOIN farm_equipment_service_parts fsp ON fsp.service_record_id = fsr.id

WHERE fe.is_active = true

GROUP BY fe.id, fe.name, fe.location, fe.category, fe.description

ORDER BY total_cost DESC;

-- Grant permissions
GRANT SELECT ON public.farm_equipment_service_cost_summary TO authenticated, service_role, anon;
GRANT SELECT ON public.farm_equipment_service_details TO authenticated, service_role, anon;
GRANT SELECT ON public.farm_equipment_cost_overview TO authenticated, service_role, anon;
