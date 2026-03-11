/*
  # Auto-Cancel Synchronization Protocols on APSĖK Status

  1. New Functions
    - `cancel_animal_synchronization_protocols(p_animal_id UUID)`
      - Cancels all active synchronization protocols for an animal
      - Marks incomplete synchronization steps as cancelled
      - Updates associated visits to 'Atšauktas' status
      - Does NOT deduct medication from cancelled steps
      - Returns count of cancelled protocols

    - `on_gea_daily_status_change()`
      - Trigger function that watches for GEA status changes
      - Automatically calls cancellation when statusas becomes 'APSĖK'

  2. New Triggers
    - `trg_gea_status_apsek` on gea_daily table
      - Fires after INSERT or UPDATE
      - Monitors statusas field changes to 'APSĖK'

  3. Important Notes
    - Completed synchronization steps remain completed with their stock deductions intact
    - Only incomplete/pending steps are cancelled without stock deduction
    - Visit history is preserved for audit purposes
    - Auto-cancellation reason is logged in notes
*/

-- Function to cancel all active synchronization protocols for an animal
CREATE OR REPLACE FUNCTION cancel_animal_synchronization_protocols(p_animal_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cancelled_count INTEGER := 0;
  v_sync_record RECORD;
BEGIN
  -- Find all active synchronization protocols for this animal
  FOR v_sync_record IN
    SELECT id
    FROM animal_synchronizations
    WHERE animal_id = p_animal_id
      AND status = 'Active'
  LOOP
    -- Update the synchronization protocol status to Cancelled
    UPDATE animal_synchronizations
    SET
      status = 'Cancelled',
      notes = COALESCE(notes || E'\n\n', '') || 'Automatiškai atšaukta dėl APSĖK statuso (' || NOW()::DATE || ')',
      updated_at = NOW()
    WHERE id = v_sync_record.id;

    -- Cancel all incomplete synchronization steps (do not deduct stock)
    -- Completed steps remain as-is with their stock deductions intact
    UPDATE synchronization_steps
    SET
      notes = COALESCE(notes || E'\n', '') || 'Atšaukta dėl APSĖK statuso',
      updated_at = NOW()
    WHERE synchronization_id = v_sync_record.id
      AND completed = FALSE;

    -- Cancel associated visits that haven't been completed
    -- These are visits created for synchronization steps
    UPDATE animal_visits
    SET
      status = 'Atšauktas',
      notes = COALESCE(notes || E'\n\n', '') || 'Automatiškai atšaukta: gyvūnas apsėklintas (APSĖK statusas)',
      updated_at = NOW()
    WHERE sync_step_id IN (
      SELECT id
      FROM synchronization_steps
      WHERE synchronization_id = v_sync_record.id
        AND completed = FALSE
    )
    AND status != 'Baigtas';

    v_cancelled_count := v_cancelled_count + 1;
  END LOOP;

  RETURN v_cancelled_count;
END;
$$;

-- Trigger function to watch for GEA status changes to APSĖK
CREATE OR REPLACE FUNCTION on_gea_daily_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cancelled_count INTEGER;
  v_old_status TEXT;
  v_new_status TEXT;
BEGIN
  -- Normalize status values (trim whitespace, handle nulls)
  v_old_status := TRIM(COALESCE(OLD.statusas, ''));
  v_new_status := TRIM(COALESCE(NEW.statusas, ''));

  -- CRITICAL FIX: Only trigger when status is TRANSITIONING TO 'APSĖK'
  -- Must satisfy ALL conditions:
  -- 1. New status is exactly 'APSĖK'
  -- 2. Either it's a new INSERT with 'APSĖK', OR
  -- 3. It's an UPDATE where old status was NOT 'APSĖK' (actual transition)
  IF v_new_status = 'APSĖK' AND
     (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND v_old_status != 'APSĖK')) THEN

    RAISE NOTICE 'Auto-cancelling synchronizations for animal % - status transitioning to APSĖK (was: %)',
      NEW.animal_id, v_old_status;

    -- Cancel all active synchronization protocols for this animal
    v_cancelled_count := cancel_animal_synchronization_protocols(NEW.animal_id);

    -- Log the cancellation (optional - could be useful for debugging)
    IF v_cancelled_count > 0 THEN
      RAISE NOTICE 'Auto-cancelled % synchronization protocol(s) for animal % due to APSĖK status',
        v_cancelled_count, NEW.animal_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger on gea_daily table
DROP TRIGGER IF EXISTS trg_gea_status_apsek ON gea_daily;
CREATE TRIGGER trg_gea_status_apsek
  AFTER INSERT OR UPDATE OF statusas ON gea_daily
  FOR EACH ROW
  EXECUTE FUNCTION on_gea_daily_status_change();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION cancel_animal_synchronization_protocols(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION on_gea_daily_status_change() TO authenticated;
