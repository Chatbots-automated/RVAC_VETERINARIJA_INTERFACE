/*
  # Add schedule_id to maintenance_work_orders

  1. Changes
    - Add schedule_id column to maintenance_work_orders table
    - Add foreign key constraint to maintenance_schedules
    - Create index for performance
*/

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'maintenance_work_orders' AND column_name = 'schedule_id'
  ) THEN
    ALTER TABLE maintenance_work_orders 
    ADD COLUMN schedule_id uuid REFERENCES maintenance_schedules(id);
    
    CREATE INDEX IF NOT EXISTS idx_work_orders_schedule 
    ON maintenance_work_orders(schedule_id);
  END IF;
END $$;
