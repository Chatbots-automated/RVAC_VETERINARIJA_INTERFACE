-- Cost Accumulation System (Kaupiniai)
-- Allows tracking project costs by uploading invoices and auto-summing expenses

-- Table 1: Cost accumulation projects
CREATE TABLE IF NOT EXISTS public.cost_accumulation_projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    name text NOT NULL,
    description text,
    start_date date,
    end_date date,
    status text DEFAULT 'active' CHECK (status IN ('active', 'completed', 'on_hold', 'cancelled')),
    budget_estimate numeric(15,2),
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_at timestamp with time zone DEFAULT now(),
    is_active boolean DEFAULT true
);

-- Table 2: Cost accumulation documents (uploaded files)
CREATE TABLE IF NOT EXISTS public.cost_accumulation_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    project_id uuid NOT NULL REFERENCES public.cost_accumulation_projects(id) ON DELETE CASCADE,
    file_name text NOT NULL,
    file_path text, -- Supabase storage path
    file_url text, -- Public URL if needed
    file_size bigint,
    mime_type text,
    document_type text DEFAULT 'invoice' CHECK (document_type IN ('invoice', 'receipt', 'contract', 'estimate', 'other')),
    upload_date timestamp with time zone DEFAULT now(),
    uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    
    -- Invoice data from webhook (JSON structure)
    supplier_name text,
    supplier_code text,
    invoice_number text,
    invoice_date date,
    due_date date,
    currency text DEFAULT 'EUR',
    total_net numeric(15,2),
    total_vat numeric(15,2),
    total_gross numeric(15,2),
    vat_rate numeric(5,2),
    
    -- Raw webhook response
    webhook_response jsonb,
    processing_status text DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
    processing_error text,
    processed_at timestamp with time zone,
    
    notes text,
    created_at timestamp with time zone DEFAULT now()
);

-- Table 3: Cost accumulation items (line items from invoices)
CREATE TABLE IF NOT EXISTS public.cost_accumulation_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    project_id uuid NOT NULL REFERENCES public.cost_accumulation_projects(id) ON DELETE CASCADE,
    document_id uuid REFERENCES public.cost_accumulation_documents(id) ON DELETE CASCADE,
    
    line_no integer,
    sku text,
    description text NOT NULL,
    quantity numeric(15,3),
    unit text,
    unit_price numeric(15,2),
    net_amount numeric(15,2),
    vat_rate numeric(5,2),
    vat_amount numeric(15,2),
    gross_amount numeric(15,2) NOT NULL,
    
    category text, -- Optional categorization
    batch_number text,
    expiry_date date,
    
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- View: Project cost summary
CREATE OR REPLACE VIEW public.cost_accumulation_project_summary AS
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

-- Indexes for performance
CREATE INDEX idx_cost_accumulation_documents_project_id ON public.cost_accumulation_documents(project_id);
CREATE INDEX idx_cost_accumulation_documents_status ON public.cost_accumulation_documents(processing_status);
CREATE INDEX idx_cost_accumulation_items_project_id ON public.cost_accumulation_items(project_id);
CREATE INDEX idx_cost_accumulation_items_document_id ON public.cost_accumulation_items(document_id);

-- RLS Policies (disable for now, like other tables)
ALTER TABLE public.cost_accumulation_projects DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_accumulation_documents DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_accumulation_items DISABLE ROW LEVEL SECURITY;

-- Grant permissions
GRANT ALL ON public.cost_accumulation_projects TO authenticated, service_role, anon;
GRANT ALL ON public.cost_accumulation_documents TO authenticated, service_role, anon;
GRANT ALL ON public.cost_accumulation_items TO authenticated, service_role, anon;
GRANT SELECT ON public.cost_accumulation_project_summary TO authenticated, service_role, anon;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_cost_accumulation_project_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_cost_accumulation_project_timestamp
    BEFORE UPDATE ON public.cost_accumulation_projects
    FOR EACH ROW
    EXECUTE FUNCTION update_cost_accumulation_project_updated_at();
