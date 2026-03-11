-- ============================================================================
-- MAKE KAUPINIAI STORAGE BUCKETS PUBLIC
-- ============================================================================
-- This migration makes the storage buckets public so files can be viewed
-- directly in the browser without requiring signed URLs
-- ============================================================================

-- Update kaupiniai-documents bucket to be public
UPDATE storage.buckets 
SET public = true 
WHERE id = 'kaupiniai-documents';

-- Update kaupiniai-acts bucket to be public
UPDATE storage.buckets 
SET public = true 
WHERE id = 'kaupiniai-acts';

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- After running this migration, verify that both buckets are public:
-- SELECT id, name, public FROM storage.buckets WHERE id IN ('kaupiniai-documents', 'kaupiniai-acts');
-- Both should show public = true
-- ============================================================================
