const { Client } = require('pg');
const fs = require('fs');
require('dotenv').config();

async function runMigration() {
  // Parse the Supabase URL to get connection details
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)[1];

  // Construct the Postgres connection string
  // For Supabase, we need the direct database connection
  // Format: postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres

  console.log('⚠️  You need to apply this SQL via Supabase Dashboard SQL Editor');
  console.log('⚠️  Go to: https://supabase.com/dashboard/project/' + projectRef + '/sql/new\n');
  console.log('Copy and paste the following SQL:\n');
  console.log('='.repeat(80));

  const sql = fs.readFileSync('fix-technika.sql', 'utf8');
  console.log(sql);

  console.log('='.repeat(80));
  console.log('\nOR run it directly if you have database password:');
  console.log(`psql "postgresql://postgres:[YOUR_DB_PASSWORD]@db.${projectRef}.supabase.co:5432/postgres" -f fix-technika.sql`);
}

runMigration().catch(console.error);
