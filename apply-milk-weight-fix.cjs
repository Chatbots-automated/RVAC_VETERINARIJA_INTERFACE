require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: 'public' }
  }
);

const sql = `
CREATE OR REPLACE FUNCTION upsert_milk_weight(p_payload jsonb)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session_type text;
  v_date date;
  v_event_type text;
  v_weight integer;
  v_hose text;
  v_stable boolean;
  v_ts_local text;
  v_tz text;
  v_session_id text;
  v_measurement_timestamp timestamptz;
  v_result json;
BEGIN
  -- Extract values from nested JSON payload
  v_weight := (p_payload->'measurement'->>'weight')::integer;
  v_hose := p_payload->'status'->>'hose';
  v_stable := (p_payload->'status'->>'stable')::boolean;
  v_ts_local := p_payload->'measurement'->>'ts_local';
  v_tz := p_payload->'measurement'->>'tz';
  v_session_id := p_payload->>'session_id';
  v_event_type := p_payload->>'event';

  -- Parse the local timestamp and convert to UTC
  v_measurement_timestamp := (v_ts_local || ' ' || v_tz)::timestamptz;

  -- Determine session type
  v_session_type := determine_session_type(v_measurement_timestamp, v_tz);

  -- Extract date from measurement timestamp in local timezone
  v_date := (v_measurement_timestamp AT TIME ZONE v_tz)::date;

  -- Insert new event record
  INSERT INTO milk_weights (
    date,
    session_type,
    weight,
    session_id,
    measurement_timestamp,
    timezone,
    hose_status,
    stable_status,
    event_type,
    raw_data,
    created_at,
    updated_at
  ) VALUES (
    v_date,
    v_session_type,
    v_weight,
    v_session_id,
    v_measurement_timestamp,
    v_tz,
    v_hose,
    v_stable,
    v_event_type,
    p_payload,
    now(),
    now()
  );

  -- Return success
  v_result := json_build_object(
    'success', true,
    'date', v_date,
    'session_type', v_session_type,
    'event_type', v_event_type,
    'weight', v_weight
  );

  RETURN v_result;
END;
$$;
`;

async function applyFix() {
  console.log('\n🔧 Fixing upsert_milk_weight function...\n');
  
  console.log('📋 SQL to apply in Supabase Dashboard:');
  console.log('   https://supabase.com/dashboard/project/olxnahsxvyiadknybagt/sql/new\n');
  console.log(sql);
  console.log('\n✅ After running this SQL:');
  console.log('   - Function will accept single JSON payload parameter');
  console.log('   - Will work with webhook calls');
  console.log('   - No more "ON CONFLICT" error\n');
}

applyFix().catch(console.error);
