-- ============================================================================
-- KAUPINIAI FILE STORAGE SETUP
-- ============================================================================
-- Creates storage buckets and policies for storing project documents
-- ============================================================================

-- Create storage bucket for project documents (public for viewing in browser)
INSERT INTO storage.buckets (id, name, public)
VALUES ('kaupiniai-documents', 'kaupiniai-documents', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Create storage bucket for act documents (public for viewing in browser)
INSERT INTO storage.buckets (id, name, public)
VALUES ('kaupiniai-acts', 'kaupiniai-acts', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- ============================================================================
-- STORAGE POLICIES
-- ============================================================================
-- Note: Since we use custom authentication (not Supabase Auth), we grant access to anon role
-- Security is handled at the application level

-- Drop existing policies if they exist (to allow re-running this migration)
DROP POLICY IF EXISTS "Allow all uploads to kaupiniai-documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow all reads from kaupiniai-documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow all deletes from kaupiniai-documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow all uploads to kaupiniai-acts" ON storage.objects;
DROP POLICY IF EXISTS "Allow all reads from kaupiniai-acts" ON storage.objects;
DROP POLICY IF EXISTS "Allow all deletes from kaupiniai-acts" ON storage.objects;

-- Policy: Allow all uploads to kaupiniai-documents
CREATE POLICY "Allow all uploads to kaupiniai-documents"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'kaupiniai-documents');

-- Policy: Allow all reads from kaupiniai-documents
CREATE POLICY "Allow all reads from kaupiniai-documents"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'kaupiniai-documents');

-- Policy: Allow all deletes from kaupiniai-documents
CREATE POLICY "Allow all deletes from kaupiniai-documents"
ON storage.objects FOR DELETE
TO anon, authenticated
USING (bucket_id = 'kaupiniai-documents');

-- Policy: Allow all uploads to kaupiniai-acts
CREATE POLICY "Allow all uploads to kaupiniai-acts"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'kaupiniai-acts');

-- Policy: Allow all reads from kaupiniai-acts
CREATE POLICY "Allow all reads from kaupiniai-acts"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'kaupiniai-acts');

-- Policy: Allow all deletes from kaupiniai-acts
CREATE POLICY "Allow all deletes from kaupiniai-acts"
ON storage.objects FOR DELETE
TO anon, authenticated
USING (bucket_id = 'kaupiniai-acts');

-- ============================================================================
-- UPDATE DOCUMENT TABLE
-- ============================================================================

-- Add act_file_path for storing the act document separately
ALTER TABLE cost_accumulation_documents 
ADD COLUMN IF NOT EXISTS act_file_path text;

ALTER TABLE cost_accumulation_documents 
ADD COLUMN IF NOT EXISTS act_file_url text;

COMMENT ON COLUMN cost_accumulation_documents.act_file_path IS 'Storage path for the act document file';
COMMENT ON COLUMN cost_accumulation_documents.act_file_url IS 'Public URL for the act document file';

-- ============================================================================
-- NOTES
-- ============================================================================
-- Storage Structure:
--   kaupiniai-documents/
--     └── {project_id}/
--           └── {timestamp}_{filename}.pdf
--
--   kaupiniai-acts/
--     └── {project_id}/
--           └── {act_number}_{timestamp}.pdf
--
-- File Paths:
--   - file_path: Path in kaupiniai-documents bucket (main invoice/document)
--   - file_url: Signed URL for downloading main document
--   - act_file_path: Path in kaupiniai-acts bucket (act document)
--   - act_file_url: Signed URL for downloading act document
-- ============================================================================
