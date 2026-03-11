/*
  # Track All Milk Weight Events

  1. Changes
    - Remove UNIQUE constraint on (date, session_type) to allow multiple events per session
    - Add event_type column to track event types (RECOVERY, ALERT, etc.)
    - Update upsert function to insert every event instead of updating
    - Add index for better query performance

  2. Migration Strategy
    - This migration updates the milk_weights table to track every webhook event
    - Each RECOVERY event shows milk accumulation
    - Each ALERT event shows milk unloading
    - Frontend will aggregate to show peak weights per session
*/

-- Drop the unique constraint
ALTER TABLE milk_weights DROP CONSTRAINT IF EXISTS milk_weights_date_session_type_key;

-- Add event_type column
ALTER TABLE milk_weights ADD COLUMN IF NOT EXISTS event_type text;

-- Create index for querying by date, session_type, and event_type
CREATE INDEX IF NOT EXISTS idx_milk_weights_events ON milk_weights(date DESC, session_type, event_type);

-- Update the upsert function to insert every event
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
  -- Determine session type
  v_session_type := determine_session_type(p_measurement_timestamp, p_timezone);

  -- Extract date from measurement timestamp
  v_date := (p_measurement_timestamp AT TIME ZONE p_timezone)::date;

  -- Extract event type from raw data
  v_event_type := p_raw_data->>'event';

  -- Insert new event record (no longer upserting)
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
    p_weight,
    p_session_id,
    p_measurement_timestamp,
    p_timezone,
    p_hose_status,
    p_stable_status,
    v_event_type,
    p_raw_data,
    now(),
    now()
  );

  -- Return success
  v_result := json_build_object(
    'success', true,
    'date', v_date,
    'session_type', v_session_type,
    'event_type', v_event_type,
    'weight', p_weight
  );

  RETURN v_result;
END;
$$;

-- Add comment
COMMENT ON COLUMN milk_weights.event_type IS 'Event type from webhook: RECOVERY (milk accumulation), ALERT (milk unloaded), etc.';
