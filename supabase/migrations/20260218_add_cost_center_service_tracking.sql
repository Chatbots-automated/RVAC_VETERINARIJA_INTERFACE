-- ============================================================================
-- ADD SERVICE TRACKING TO COST CENTERS
-- ============================================================================
-- Track if a cost center represents a service/repair, and who performed it
-- ============================================================================

-- Add service tracking columns to cost_centers
ALTER TABLE cost_centers
ADD COLUMN IF NOT EXISTS is_service boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS service_type text CHECK (service_type IN ('our_workers', 'external_company')),
ADD COLUMN IF NOT EXISTS service_worker_ids uuid[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS service_company_name text;

-- Comments
COMMENT ON COLUMN cost_centers.is_service IS 'Whether this cost center represents a service/repair';
COMMENT ON COLUMN cost_centers.service_type IS 'Who performed the service: our_workers or external_company';
COMMENT ON COLUMN cost_centers.service_worker_ids IS 'Array of worker IDs if service_type is our_workers';
COMMENT ON COLUMN cost_centers.service_company_name IS 'Company name if service_type is external_company';

-- Index for querying services
CREATE INDEX IF NOT EXISTS idx_cost_centers_is_service ON cost_centers(is_service) WHERE is_service = true;
CREATE INDEX IF NOT EXISTS idx_cost_centers_service_type ON cost_centers(service_type) WHERE service_type IS NOT NULL;
