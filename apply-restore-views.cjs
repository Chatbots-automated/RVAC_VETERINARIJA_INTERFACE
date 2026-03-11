const fs = require('fs');

console.log('🔄 RESTORE ORIGINAL VIEWS + INDEXES\n');
console.log('The problem: Complex LATERAL joins and materialized views.\n');
console.log('The solution: Go back to the ORIGINAL simple views from 20260208.\n');
console.log('              They worked fine - just needed indexes!\n');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📋 MIGRATION TO APPLY');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('File: supabase/migrations/20260301000004_restore_original_views.sql\n');

console.log('What it does:');
console.log('  ✓ Adds 16 indexes on base tables (gea_ataskaita1/2/3, treatments, animals, etc.)');
console.log('  ✓ Fixes RLS policies for system_settings');
console.log('  ✓ Restores ORIGINAL view definitions from 20260208000001');
console.log('  ✓ Uses DISTINCT ON instead of LATERAL joins');
console.log('  ✓ Runs ANALYZE to update query planner statistics\n');

console.log('Views restored:');
console.log('  • treatment_milk_loss_summary');
console.log('  • vw_animal_profitability');
console.log('  • vw_herd_profitability_summary');
console.log('  • vw_treatment_roi_analysis');
console.log('  • animal_milk_loss_by_synchronization\n');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🚀 HOW TO APPLY');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('1. https://supabase.com/dashboard/project/olxnahsxvyiadknybagt/sql/new\n');
console.log('2. Copy: supabase/migrations/20260301000004_restore_original_views.sql\n');
console.log('3. Paste and Run\n');

console.log('⏱️  Takes ~45 seconds (creating indexes + rebuilding views)\n');

try {
  const migration = fs.readFileSync('./supabase/migrations/20260301000004_restore_original_views.sql', 'utf8');
  console.log('✅ Migration ready!');
  console.log(`📏 Size: ${Math.round(migration.length / 1024)} KB\n`);
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💡 WHY THIS WORKS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  console.log('The 20260208 views used:');
  console.log('  • DISTINCT ON (simple, fast)');
  console.log('  • Single LEFT JOIN to gea_daily_cows_joined');
  console.log('  • No LATERAL subqueries\n');
  
  console.log('The 20260301000002 views used:');
  console.log('  • LATERAL joins (scans gea_daily_cows_joined PER ROW)');
  console.log('  • Materialized views (stale data)');
  console.log('  • Complex nested queries\n');
  
  console.log('Result: Original approach + indexes = FAST ⚡\n');
} catch (err) {
  console.error('❌ Error:', err.message);
  process.exit(1);
}
