-- Fix cost_accumulation_project_summary view to return 'id' and 'name' instead of 'project_id' and 'project_name'

-- Drop the existing view first
DROP VIEW IF EXISTS public.cost_accumulation_project_summary;

-- Recreate with correct column names
CREATE VIEW public.cost_accumulation_project_summary AS
SELECT 
    p.id,
    p.name,
    p.description,
    p.start_date,
    p.end_date,
    p.status,
    p.budget_estimate,
    p.notes,
    p.created_at,
    
    -- Document counts
    COUNT(DISTINCT d.id) as total_documents,
    COUNT(DISTINCT d.id) FILTER (WHERE d.processing_status = 'completed') as processed_documents,
    COUNT(DISTINCT d.id) FILTER (WHERE d.processing_status = 'failed') as failed_documents,
    
    -- Cost totals from documents
    COALESCE(SUM(d.total_net), 0) as total_net,
    COALESCE(SUM(d.total_vat), 0) as total_vat,
    COALESCE(SUM(d.total_gross), 0) as total_gross,
    
    -- Cost totals from items (more accurate)
    COALESCE(SUM(i.net_amount), 0) as items_total_net,
    COALESCE(SUM(i.vat_amount), 0) as items_total_vat,
    COALESCE(SUM(i.gross_amount), 0) as items_total_gross,
    
    -- Item counts
    COUNT(i.id) as total_items,
    
    -- Budget comparison
    CASE 
        WHEN p.budget_estimate IS NOT NULL AND p.budget_estimate > 0 
        THEN (COALESCE(SUM(d.total_gross), 0) / p.budget_estimate * 100)
        ELSE NULL 
    END as budget_used_percentage,
    
    CASE 
        WHEN p.budget_estimate IS NOT NULL 
        THEN p.budget_estimate - COALESCE(SUM(d.total_gross), 0)
        ELSE NULL 
    END as budget_remaining

FROM public.cost_accumulation_projects p
LEFT JOIN public.cost_accumulation_documents d ON p.id = d.project_id
LEFT JOIN public.cost_accumulation_items i ON p.id = i.project_id
WHERE p.is_active = true
GROUP BY p.id, p.name, p.description, p.start_date, p.end_date, p.status, 
         p.budget_estimate, p.notes, p.created_at;
