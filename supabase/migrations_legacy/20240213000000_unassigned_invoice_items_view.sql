-- Create view for unassigned invoice items
-- These are items that haven't been assigned to any vehicle, tool, or cost center yet

CREATE OR REPLACE VIEW public.equipment_unassigned_invoice_items AS
SELECT 
  eii.id as item_id,
  eii.invoice_id,
  eii.line_no,
  eii.product_id,
  eii.description,
  eii.quantity,
  eii.unit_price,
  eii.total_price,
  eii.vat_rate,
  eii.created_at as item_created_at,
  
  -- Invoice details
  ei.invoice_number,
  ei.invoice_date,
  ei.supplier_name,
  ei.supplier_id,
  
  -- Product details
  ep.name as product_name,
  ep.product_code,
  ep.unit_type,
  ec.name as category_name,
  
  -- Check if assigned
  (SELECT COUNT(*) FROM equipment_invoice_item_assignments WHERE invoice_item_id = eii.id) as assignment_count

FROM equipment_invoice_items eii
JOIN equipment_invoices ei ON ei.id = eii.invoice_id
LEFT JOIN equipment_products ep ON ep.id = eii.product_id
LEFT JOIN equipment_categories ec ON ec.id = ep.category_id

WHERE NOT EXISTS (
  SELECT 1 
  FROM equipment_invoice_item_assignments eia 
  WHERE eia.invoice_item_id = eii.id
)

ORDER BY ei.invoice_date DESC, eii.line_no;

-- Grant permissions
GRANT SELECT ON public.equipment_unassigned_invoice_items TO authenticated, service_role, anon;
