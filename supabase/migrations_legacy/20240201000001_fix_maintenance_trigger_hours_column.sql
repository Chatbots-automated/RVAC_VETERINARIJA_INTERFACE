/*
  # Fix update_schedule_on_work_order_complete trigger function

  This migration fixes the trigger function that updates maintenance schedules
  when work orders are completed. The issue was using 'current_hours' instead
  of 'current_engine_hours' column name.
*/

CREATE OR REPLACE FUNCTION "public"."update_schedule_on_work_order_complete"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_schedule RECORD;
  v_vehicle_mileage numeric;
  v_vehicle_hours numeric;
BEGIN
  -- Handle INSERT (when work order is created as 'completed')
  IF TG_OP = 'INSERT' AND NEW.status = 'completed' AND NEW.schedule_id IS NOT NULL THEN
    -- Get the schedule details
    SELECT * INTO v_schedule
    FROM maintenance_schedules
    WHERE id = NEW.schedule_id;

    -- Get vehicle readings (prefer work order values, fallback to vehicle current values)
    SELECT 
      COALESCE(NEW.odometer_reading, current_mileage),
      COALESCE(NEW.engine_hours, current_engine_hours)
    INTO v_vehicle_mileage, v_vehicle_hours
    FROM vehicles
    WHERE id = v_schedule.vehicle_id;

    -- Update last_performed_date and calculate next_due_date
    UPDATE maintenance_schedules
    SET
      last_performed_date = COALESCE(NEW.completed_date::date, NEW.created_at::date, CURRENT_DATE),
      -- Calculate next_due_date based on interval_type
      -- Handle 0 or negative intervals by setting to 1 year from now
      next_due_date = CASE
        WHEN v_schedule.maintenance_type = 'date' AND v_schedule.interval_type = 'days' THEN
          CASE 
            WHEN v_schedule.interval_value <= 0 THEN
              (COALESCE(NEW.completed_date::date, NEW.created_at::date, CURRENT_DATE) + '1 year'::interval)::date
            ELSE
              (COALESCE(NEW.completed_date::date, NEW.created_at::date, CURRENT_DATE) + (v_schedule.interval_value || ' days')::interval)::date
          END
        WHEN v_schedule.maintenance_type = 'date' AND v_schedule.interval_type = 'months' THEN
          CASE 
            WHEN v_schedule.interval_value <= 0 THEN
              (COALESCE(NEW.completed_date::date, NEW.created_at::date, CURRENT_DATE) + '1 year'::interval)::date
            ELSE
              (COALESCE(NEW.completed_date::date, NEW.created_at::date, CURRENT_DATE) + (v_schedule.interval_value || ' months')::interval)::date
          END
        WHEN v_schedule.maintenance_type = 'date' AND v_schedule.interval_type = 'years' THEN
          CASE 
            WHEN v_schedule.interval_value <= 0 THEN
              (COALESCE(NEW.completed_date::date, NEW.created_at::date, CURRENT_DATE) + '1 year'::interval)::date
            ELSE
              (COALESCE(NEW.completed_date::date, NEW.created_at::date, CURRENT_DATE) + (v_schedule.interval_value || ' years')::interval)::date
          END
        ELSE
          v_schedule.next_due_date -- Keep existing for mileage/hours
      END,
      -- Update mileage if applicable
      last_performed_mileage = CASE
        WHEN v_schedule.maintenance_type = 'mileage' AND v_vehicle_mileage IS NOT NULL THEN
          v_vehicle_mileage
        ELSE v_schedule.last_performed_mileage
      END,
      next_due_mileage = CASE
        WHEN v_schedule.maintenance_type = 'mileage' AND v_vehicle_mileage IS NOT NULL THEN
          v_vehicle_mileage + v_schedule.interval_value
        ELSE v_schedule.next_due_mileage
      END,
      -- Update hours if applicable (FIXED: use current_engine_hours instead of current_hours)
      last_performed_hours = CASE
        WHEN v_schedule.maintenance_type = 'hours' AND v_vehicle_hours IS NOT NULL THEN
          v_vehicle_hours
        ELSE v_schedule.last_performed_hours
      END,
      next_due_hours = CASE
        WHEN v_schedule.maintenance_type = 'hours' AND v_vehicle_hours IS NOT NULL THEN
          v_vehicle_hours + v_schedule.interval_value
        ELSE v_schedule.next_due_hours
      END
    WHERE id = NEW.schedule_id;

    RETURN NEW;
  END IF;

  -- Handle UPDATE (when work order status changes to 'completed')
  IF TG_OP = 'UPDATE' AND NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') AND NEW.schedule_id IS NOT NULL THEN
    -- Get the schedule details
    SELECT * INTO v_schedule
    FROM maintenance_schedules
    WHERE id = NEW.schedule_id;

    -- Get vehicle readings (prefer work order values, fallback to vehicle current values)
    SELECT 
      COALESCE(NEW.odometer_reading, current_mileage),
      COALESCE(NEW.engine_hours, current_engine_hours)
    INTO v_vehicle_mileage, v_vehicle_hours
    FROM vehicles
    WHERE id = v_schedule.vehicle_id;

    -- Update last_performed_date and calculate next_due_date
    UPDATE maintenance_schedules
    SET
      last_performed_date = COALESCE(NEW.completed_date::date, CURRENT_DATE),
      -- Calculate next_due_date based on interval_type
      -- Handle 0 or negative intervals by setting to 1 year from now
      next_due_date = CASE
        WHEN v_schedule.maintenance_type = 'date' AND v_schedule.interval_type = 'days' THEN
          CASE 
            WHEN v_schedule.interval_value <= 0 THEN
              (COALESCE(NEW.completed_date::date, CURRENT_DATE) + '1 year'::interval)::date
            ELSE
              (COALESCE(NEW.completed_date::date, CURRENT_DATE) + (v_schedule.interval_value || ' days')::interval)::date
          END
        WHEN v_schedule.maintenance_type = 'date' AND v_schedule.interval_type = 'months' THEN
          CASE 
            WHEN v_schedule.interval_value <= 0 THEN
              (COALESCE(NEW.completed_date::date, CURRENT_DATE) + '1 year'::interval)::date
            ELSE
              (COALESCE(NEW.completed_date::date, CURRENT_DATE) + (v_schedule.interval_value || ' months')::interval)::date
          END
        WHEN v_schedule.maintenance_type = 'date' AND v_schedule.interval_type = 'years' THEN
          CASE 
            WHEN v_schedule.interval_value <= 0 THEN
              (COALESCE(NEW.completed_date::date, CURRENT_DATE) + '1 year'::interval)::date
            ELSE
              (COALESCE(NEW.completed_date::date, CURRENT_DATE) + (v_schedule.interval_value || ' years')::interval)::date
          END
        ELSE
          v_schedule.next_due_date -- Keep existing for mileage/hours
      END,
      -- Update mileage if applicable
      last_performed_mileage = CASE
        WHEN v_schedule.maintenance_type = 'mileage' AND v_vehicle_mileage IS NOT NULL THEN
          v_vehicle_mileage
        ELSE v_schedule.last_performed_mileage
      END,
      next_due_mileage = CASE
        WHEN v_schedule.maintenance_type = 'mileage' AND v_vehicle_mileage IS NOT NULL THEN
          v_vehicle_mileage + v_schedule.interval_value
        ELSE v_schedule.next_due_mileage
      END,
      -- Update hours if applicable (FIXED: use current_engine_hours instead of current_hours)
      last_performed_hours = CASE
        WHEN v_schedule.maintenance_type = 'hours' AND v_vehicle_hours IS NOT NULL THEN
          v_vehicle_hours
        ELSE v_schedule.last_performed_hours
      END,
      next_due_hours = CASE
        WHEN v_schedule.maintenance_type = 'hours' AND v_vehicle_hours IS NOT NULL THEN
          v_vehicle_hours + v_schedule.interval_value
        ELSE v_schedule.next_due_hours
      END
    WHERE id = NEW.schedule_id;
  END IF;

  RETURN NEW;
END;
$$;
