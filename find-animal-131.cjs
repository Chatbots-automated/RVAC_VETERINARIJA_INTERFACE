const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  // Search by multiple possible fields
  console.log('Searching for animal with collar/tag 131...\n');

  // Try by ear_tag containing 131
  const { data: byTag } = await supabase
    .from('animals')
    .select('*')
    .or('ear_tag.eq.131,ear_tag.ilike.%131%,ear_tag.eq.LT000008564387')
    .limit(5);

  console.log('Animals matching ear_tag search:', byTag?.length || 0);
  byTag?.forEach(a => console.log(`  - ID: ${a.id}, Tag: ${a.ear_tag}`));

  // Try by internal_id
  const { data: byInternal } = await supabase
    .from('animals')
    .select('*')
    .eq('internal_id', '131')
    .maybeSingle();

  if (byInternal) {
    console.log('\nFound by internal_id 131:', byInternal.id, byInternal.ear_tag);
  }

  // Get one animal to see the schema
  const { data: sample } = await supabase
    .from('animals')
    .select('*')
    .limit(1)
    .single();

  console.log('\nSample animal columns:', Object.keys(sample || {}));
})();
