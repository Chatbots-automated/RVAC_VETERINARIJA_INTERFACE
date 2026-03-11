-- Fix cost_center_summary view to include parent_id for hierarchy support
-- This is needed to properly display parent/child cost center relationships

DROP VIEW IF EXISTS public.cost_center_summary;

CREATE OR REPLACE VIEW public.cost_center_summary AS
SELECT 
  cc.id AS cost_center_id,
  cc.name AS cost_center_name,
  cc.description,
  cc.color,
  cc.parent_id,
  cc.is_active,
  COUNT(DISTINCT eia.id) AS total_assignments,
  COALESCE(SUM(eii.total_price), 0) AS total_cost,
  MIN(ei.invoice_date) AS first_assignment_date,
  MAX(ei.invoice_date) AS last_assignment_date
FROM public.cost_centers cc
LEFT JOIN public.equipment_invoice_item_assignments eia 
  ON eia.cost_center_id = cc.id AND eia.assignment_type = 'cost_center'
LEFT JOIN public.equipment_invoice_items eii 
  ON eii.id = eia.invoice_item_id
LEFT JOIN public.equipment_invoices ei 
  ON ei.id = eii.invoice_id
WHERE cc.is_active = true
GROUP BY cc.id, cc.name, cc.description, cc.color, cc.parent_id, cc.is_active
ORDER BY cc.name;

-- Grant permissions
GRANT SELECT ON public.cost_center_summary TO authenticated;
GRANT SELECT ON public.cost_center_summary TO service_role;
