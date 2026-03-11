-- Create a view that aggregates cost center data including children
-- This will show parent cost centers with totals that include all child assignments

-- First, create a view that gets direct assignments for each cost center
CREATE OR REPLACE VIEW public.cost_center_direct_summary AS
SELECT 
  cc.id AS cost_center_id,
  cc.name AS cost_center_name,
  cc.description,
  cc.color,
  cc.parent_id,
  cc.is_active,
  COUNT(DISTINCT eia.id) AS direct_assignments,
  COALESCE(SUM(eii.total_price), 0) AS direct_cost,
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
GROUP BY cc.id, cc.name, cc.description, cc.color, cc.parent_id, cc.is_active;

-- Now create the hierarchical summary that includes children
CREATE OR REPLACE VIEW public.cost_center_summary_with_children AS
WITH RECURSIVE cost_center_hierarchy AS (
  -- Base case: all cost centers with their direct values
  SELECT 
    cost_center_id,
    parent_id,
    cost_center_id as root_id,
    direct_assignments,
    direct_cost
  FROM public.cost_center_direct_summary
  
  UNION ALL
  
  -- Recursive case: get children and roll up to parents
  SELECT 
    cch.parent_id as cost_center_id,
    parent.parent_id,
    cch.root_id,
    cch.direct_assignments,
    cch.direct_cost
  FROM cost_center_hierarchy cch
  INNER JOIN public.cost_centers parent ON parent.id = cch.parent_id
  WHERE cch.parent_id IS NOT NULL
),
aggregated_totals AS (
  SELECT 
    cost_center_id,
    SUM(direct_assignments) as total_assignments,
    SUM(direct_cost) as total_cost
  FROM cost_center_hierarchy
  GROUP BY cost_center_id
)
SELECT 
  cds.cost_center_id,
  cds.cost_center_name,
  cds.description,
  cds.color,
  cds.parent_id,
  cds.is_active,
  COALESCE(at.total_assignments, cds.direct_assignments) as total_assignments,
  COALESCE(at.total_cost, cds.direct_cost) as total_cost,
  cds.first_assignment_date,
  cds.last_assignment_date
FROM public.cost_center_direct_summary cds
LEFT JOIN aggregated_totals at ON at.cost_center_id = cds.cost_center_id
ORDER BY cds.cost_center_name;

-- Update the main cost_center_summary view to use hierarchical totals
DROP VIEW IF EXISTS public.cost_center_summary;

CREATE OR REPLACE VIEW public.cost_center_summary AS
SELECT * FROM public.cost_center_summary_with_children;

-- Grant permissions
GRANT SELECT ON public.cost_center_direct_summary TO authenticated;
GRANT SELECT ON public.cost_center_direct_summary TO service_role;
GRANT SELECT ON public.cost_center_summary_with_children TO authenticated;
GRANT SELECT ON public.cost_center_summary_with_children TO service_role;
GRANT SELECT ON public.cost_center_summary TO authenticated;
GRANT SELECT ON public.cost_center_summary TO service_role;
