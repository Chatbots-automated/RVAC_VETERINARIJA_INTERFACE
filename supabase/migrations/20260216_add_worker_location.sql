-- Add work_location to users table for worker location assignment
ALTER TABLE users
ADD COLUMN IF NOT EXISTS work_location text CHECK (work_location IN ('farm', 'warehouse', 'both'));

-- Add comment to explain the column
COMMENT ON COLUMN users.work_location IS 'Primary work location for the worker: farm, warehouse, or both';

-- Add work_location to worker_schedules for filtering
ALTER TABLE worker_schedules
ADD COLUMN IF NOT EXISTS work_location text DEFAULT 'warehouse' CHECK (work_location IN ('farm', 'warehouse'));

-- Add comment
COMMENT ON COLUMN worker_schedules.work_location IS 'Work location for this schedule entry: farm or warehouse';

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_worker_schedules_location ON worker_schedules(work_location);
CREATE INDEX IF NOT EXISTS idx_users_work_location ON users(work_location);
