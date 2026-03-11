require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function applyMigration() {
  try {
    console.log('Reading migration file...');
    const sql = fs.readFileSync('./track-all-milk-events.sql', 'utf8');

    console.log('\n1. Removing UNIQUE constraint...');
    const { error: dropError } = await supabase.rpc('exec_sql', {
      sql_query: 'ALTER TABLE milk_weights DROP CONSTRAINT IF EXISTS milk_weights_date_session_type_key;'
    });
    if (dropError && !dropError.message.includes('does not exist')) {
      console.error('Error:', dropError);
    } else {
      console.log('✅ Constraint removed');
    }

    console.log('\n2. Adding event_type column...');
    const { error: addColError } = await supabase.rpc('exec_sql', {
      sql_query: 'ALTER TABLE milk_weights ADD COLUMN IF NOT EXISTS event_type text;'
    });
    if (addColError) {
      console.error('Error:', addColError);
    } else {
      console.log('✅ Column added');
    }

    console.log('\n3. Creating index...');
    const { error: indexError } = await supabase.rpc('exec_sql', {
      sql_query: 'CREATE INDEX IF NOT EXISTS idx_milk_weights_events ON milk_weights(date DESC, session_type, event_type);'
    });
    if (indexError) {
      console.error('Error:', indexError);
    } else {
      console.log('✅ Index created');
    }

    console.log('\n4. Updating function...');
    const functionSQL = `
CREATE OR REPLACE FUNCTION upsert_milk_weight(
  p_weight integer,
  p_measurement_timestamp timestamptz,
  p_timezone text,
  p_session_id text,
  p_hose_status text,
  p_stable_status boolean,
  p_raw_data jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session_type text;
  v_date date;
  v_event_type text;
  v_result json;
BEGIN
  v_session_type := determine_session_type(p_measurement_timestamp, p_timezone);
  v_date := (p_measurement_timestamp AT TIME ZONE p_timezone)::date;
  v_event_type := p_raw_data->>'event';

  INSERT INTO milk_weights (
    date, session_type, weight, session_id, measurement_timestamp,
    timezone, hose_status, stable_status, event_type, raw_data,
    created_at, updated_at
  ) VALUES (
    v_date, v_session_type, p_weight, p_session_id, p_measurement_timestamp,
    p_timezone, p_hose_status, p_stable_status, v_event_type, p_raw_data,
    now(), now()
  );

  v_result := json_build_object(
    'success', true, 'date', v_date, 'session_type', v_session_type,
    'event_type', v_event_type, 'weight', p_weight
  );

  RETURN v_result;
END;
$$;
`;

    const { error: funcError } = await supabase.rpc('exec_sql', {
      sql_query: functionSQL
    });
    if (funcError) {
      console.error('Error:', funcError);
    } else {
      console.log('✅ Function updated');
    }

    console.log('\n5. Adding comment...');
    const { error: commentError } = await supabase.rpc('exec_sql', {
      sql_query: "COMMENT ON COLUMN milk_weights.event_type IS 'Event type from webhook: RECOVERY (milk accumulation), ALERT (milk unloaded), etc.';"
    });
    if (commentError) {
      console.error('Error:', commentError);
    } else {
      console.log('✅ Comment added');
    }

    console.log('\n✅ Migration completed successfully!');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  }
}

applyMigration();
