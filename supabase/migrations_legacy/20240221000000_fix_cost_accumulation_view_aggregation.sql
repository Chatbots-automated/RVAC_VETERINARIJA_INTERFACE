-- Fix cost_accumulation_project_summary view to correctly aggregate document and item totals
-- The issue: JOINing items creates duplicate rows, causing document totals to be multiplied

DROP VIEW IF EXISTS public.cost_accumulation_project_summary;

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
    
    -- Document counts (from documents table only)
    COALESCE(doc_stats.total_documents, 0) as total_documents,
    COALESCE(doc_stats.processed_documents, 0) as processed_documents,
    COALESCE(doc_stats.failed_documents, 0) as failed_documents,
    
    -- Cost totals from documents (invoice headers)
    COALESCE(doc_stats.total_net, 0) as total_net,
    COALESCE(doc_stats.total_vat, 0) as total_vat,
    COALESCE(doc_stats.total_gross, 0) as total_gross,
    
    -- Cost totals from items (line items - more accurate for itemized view)
    COALESCE(item_stats.items_total_net, 0) as items_total_net,
    COALESCE(item_stats.items_total_vat, 0) as items_total_vat,
    COALESCE(item_stats.items_total_gross, 0) as items_total_gross,
    
    -- Item counts
    COALESCE(item_stats.total_items, 0) as total_items,
    
    -- Budget comparison (use document totals as they're the official invoice amounts)
    CASE 
        WHEN p.budget_estimate IS NOT NULL AND p.budget_estimate > 0 
        THEN (COALESCE(doc_stats.total_gross, 0) / p.budget_estimate * 100)
        ELSE NULL 
    END as budget_used_percentage,
    
    CASE 
        WHEN p.budget_estimate IS NOT NULL 
        THEN p.budget_estimate - COALESCE(doc_stats.total_gross, 0)
        ELSE NULL 
    END as budget_remaining

FROM public.cost_accumulation_projects p

-- Aggregate documents separately to avoid duplicate rows
LEFT JOIN (
    SELECT 
        project_id,
        COUNT(*) as total_documents,
        COUNT(*) FILTER (WHERE processing_status = 'completed') as processed_documents,
        COUNT(*) FILTER (WHERE processing_status = 'failed') as failed_documents,
        SUM(total_net) as total_net,
        SUM(total_vat) as total_vat,
        SUM(total_gross) as total_gross
    FROM public.cost_accumulation_documents
    GROUP BY project_id
) doc_stats ON p.id = doc_stats.project_id

-- Aggregate items separately to avoid duplicate rows
LEFT JOIN (
    SELECT 
        project_id,
        COUNT(*) as total_items,
        SUM(net_amount) as items_total_net,
        SUM(vat_amount) as items_total_vat,
        SUM(gross_amount) as items_total_gross
    FROM public.cost_accumulation_items
    GROUP BY project_id
) item_stats ON p.id = item_stats.project_id

WHERE p.is_active = true;

GRANT SELECT ON public.cost_accumulation_project_summary TO authenticated, service_role, anon;
