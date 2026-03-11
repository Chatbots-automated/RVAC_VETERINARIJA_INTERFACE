-- ============================================================================
-- ADD TRANSPORT SERVICES TRACKING
-- ============================================================================
-- Adds ability to track transport service expenses by company
-- ============================================================================

-- Add 'transport_service' to assignment_type options
ALTER TABLE equipment_invoice_item_assignments 
DROP CONSTRAINT IF EXISTS equipment_invoice_item_assignments_assignment_type_check;

ALTER TABLE equipment_invoice_item_assignments 
ADD CONSTRAINT equipment_invoice_item_assignments_assignment_type_check 
CHECK (assignment_type = ANY (ARRAY['vehicle'::text, 'tool'::text, 'building'::text, 'general_farm'::text, 'cost_center'::text, 'transport_service'::text]));

-- Add transport_company field to store the company name from the invoice
ALTER TABLE equipment_invoice_item_assignments 
ADD COLUMN IF NOT EXISTS transport_company text;

COMMENT ON COLUMN equipment_invoice_item_assignments.transport_company IS 'Company name providing transport services (from supplier/invoice)';

-- Create index for faster transport service queries
CREATE INDEX IF NOT EXISTS idx_equipment_invoice_item_assignments_transport 
ON equipment_invoice_item_assignments(assignment_type, transport_company) 
WHERE assignment_type = 'transport_service';

-- ============================================================================
-- NOTES
-- ============================================================================
-- Transport Services:
--   - assignment_type: 'transport_service'
--   - transport_company: Name of the transport company (from parsed invoice)
--   - Can track expenses per company in reports
--   - Useful for analyzing transport costs by provider
-- ============================================================================
