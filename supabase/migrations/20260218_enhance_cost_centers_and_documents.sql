-- ============================================================================
-- ENHANCE COST CENTERS AND KAUPINIAI DOCUMENTS
-- ============================================================================
-- 1. Cost Centers: Already supports unlimited nesting via parent_id (no changes needed)
-- 2. Kaupiniai Documents: Add comments and act_number fields
-- ============================================================================

-- Add comments field to cost_accumulation_documents
ALTER TABLE cost_accumulation_documents 
ADD COLUMN IF NOT EXISTS comments text;

-- Add act_number field to cost_accumulation_documents
ALTER TABLE cost_accumulation_documents 
ADD COLUMN IF NOT EXISTS act_number text;

-- Add comments to explain the new fields
COMMENT ON COLUMN cost_accumulation_documents.comments IS 'User comments or notes about the uploaded document';
COMMENT ON COLUMN cost_accumulation_documents.act_number IS 'Official act number for the document (for official purposes)';

-- Create index on act_number for faster lookups
CREATE INDEX IF NOT EXISTS idx_cost_accumulation_documents_act_number 
ON cost_accumulation_documents(act_number) 
WHERE act_number IS NOT NULL;

-- ============================================================================
-- NOTES
-- ============================================================================
-- Cost Centers:
--   - The cost_centers table already supports unlimited nesting via parent_id
--   - No schema changes needed, only UI updates required
--   - Structure: grandparent (parent_id = NULL) → parent → child → grandchild...
--
-- Kaupiniai Documents:
--   - comments: Free-text field for user notes about the document
--   - act_number: Official act number for legal/compliance purposes
--   - Both fields are optional (nullable)
-- ============================================================================
