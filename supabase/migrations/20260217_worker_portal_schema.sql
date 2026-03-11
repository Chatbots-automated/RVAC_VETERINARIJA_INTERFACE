-- Worker Portal System Schema
-- Add worker roles, time tracking, and task reporting tables

-- 1. Update users table role constraint to include worker roles
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check 
  CHECK (role IN ('admin', 'vet', 'tech', 'viewer', 'farm_worker', 'warehouse_worker'));

-- 2. Create worker time entries table
CREATE TABLE IF NOT EXISTS worker_time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  work_location text NOT NULL CHECK (work_location IN ('farm', 'warehouse')),
  
  -- Scheduled vs actual times
  scheduled_start time,
  scheduled_end time,
  actual_start_time timestamptz NOT NULL,
  actual_end_time timestamptz,
  
  -- Entry metadata
  date date NOT NULL,
  status text DEFAULT 'active' CHECK (status IN ('active', 'completed', 'approved', 'rejected')),
  notes text,
  
  -- Admin review
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  review_notes text,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add indexes for worker_time_entries
CREATE INDEX IF NOT EXISTS idx_time_entries_worker ON worker_time_entries(worker_id, date);
CREATE INDEX IF NOT EXISTS idx_time_entries_status ON worker_time_entries(status);
CREATE INDEX IF NOT EXISTS idx_time_entries_location ON worker_time_entries(work_location);
CREATE INDEX IF NOT EXISTS idx_time_entries_date ON worker_time_entries(date);

-- Add comments
COMMENT ON TABLE worker_time_entries IS 'Worker clock in/out time tracking with admin approval workflow';
COMMENT ON COLUMN worker_time_entries.work_location IS 'Work location: farm or warehouse';
COMMENT ON COLUMN worker_time_entries.status IS 'Entry status: active (clocked in), completed (clocked out), approved, rejected';

-- 3. Create worker task reports table
CREATE TABLE IF NOT EXISTS worker_task_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  time_entry_id uuid REFERENCES worker_time_entries(id) ON DELETE CASCADE,
  
  -- Task reference (polymorphic - can reference work orders, maintenance schedules, or farm equipment services)
  task_type text NOT NULL CHECK (task_type IN ('work_order', 'maintenance_schedule', 'farm_equipment_service')),
  task_id uuid NOT NULL,
  
  -- Report details
  completion_status text NOT NULL CHECK (completion_status IN ('completed', 'in_progress', 'blocked')),
  work_description text NOT NULL,
  hours_spent numeric,
  notes text,
  
  -- Admin review
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  review_notes text,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add indexes for worker_task_reports
CREATE INDEX IF NOT EXISTS idx_task_reports_worker ON worker_task_reports(worker_id);
CREATE INDEX IF NOT EXISTS idx_task_reports_status ON worker_task_reports(status);
CREATE INDEX IF NOT EXISTS idx_task_reports_task ON worker_task_reports(task_type, task_id);
CREATE INDEX IF NOT EXISTS idx_task_reports_time_entry ON worker_task_reports(time_entry_id);
CREATE INDEX IF NOT EXISTS idx_task_reports_created ON worker_task_reports(created_at);

-- Add comments
COMMENT ON TABLE worker_task_reports IS 'Worker task completion reports for work orders, maintenance schedules, and farm equipment services';
COMMENT ON COLUMN worker_task_reports.task_type IS 'Type of task: work_order, maintenance_schedule, or farm_equipment_service';
COMMENT ON COLUMN worker_task_reports.completion_status IS 'Task completion status: completed, in_progress, or blocked';
COMMENT ON COLUMN worker_task_reports.status IS 'Report review status: pending, approved, or rejected';

-- 4. Disable RLS on new tables (using custom auth, not Supabase Auth)
-- Application-level security is enforced through queries
ALTER TABLE worker_time_entries DISABLE ROW LEVEL SECURITY;
ALTER TABLE worker_task_reports DISABLE ROW LEVEL SECURITY;

-- 5. RLS policies skipped - using custom auth system
-- Security is enforced at application level through query filters
-- All queries filter by worker_id from the logged-in user's session

-- 7. Create helper views for admin dashboard

-- View for pending approvals summary
CREATE OR REPLACE VIEW worker_approval_summary AS
SELECT 
  (SELECT COUNT(*) FROM worker_time_entries WHERE status = 'completed') as pending_time_entries,
  (SELECT COUNT(*) FROM worker_task_reports WHERE status = 'pending') as pending_task_reports,
  (SELECT COUNT(DISTINCT worker_id) FROM worker_time_entries WHERE status = 'active') as workers_clocked_in;

-- View for worker time entries with user details
CREATE OR REPLACE VIEW worker_time_entries_detail AS
SELECT 
  wte.*,
  u.full_name as worker_name,
  u.email as worker_email,
  u.work_location as worker_default_location,
  reviewer.full_name as reviewed_by_name,
  EXTRACT(EPOCH FROM (wte.actual_end_time - wte.actual_start_time))/3600 as hours_worked
FROM worker_time_entries wte
JOIN users u ON u.id = wte.worker_id
LEFT JOIN users reviewer ON reviewer.id = wte.reviewed_by
ORDER BY wte.date DESC, wte.created_at DESC;

-- View for worker task reports with details
CREATE OR REPLACE VIEW worker_task_reports_detail AS
SELECT 
  wtr.*,
  u.full_name as worker_name,
  u.email as worker_email,
  reviewer.full_name as reviewed_by_name,
  CASE 
    WHEN wtr.task_type = 'work_order' THEN (
      SELECT work_order_number FROM maintenance_work_orders WHERE id = wtr.task_id
    )
    WHEN wtr.task_type = 'maintenance_schedule' THEN (
      SELECT schedule_name FROM maintenance_schedules WHERE id = wtr.task_id
    )
    WHEN wtr.task_type = 'farm_equipment_service' THEN (
      SELECT item_name FROM farm_equipment_items WHERE id = wtr.task_id
    )
  END as task_name
FROM worker_task_reports wtr
JOIN users u ON u.id = wtr.worker_id
LEFT JOIN users reviewer ON reviewer.id = wtr.reviewed_by
ORDER BY wtr.created_at DESC;

-- Grant permissions on views
GRANT SELECT ON worker_approval_summary TO anon;
GRANT SELECT ON worker_approval_summary TO authenticated;
GRANT SELECT ON worker_time_entries_detail TO anon;
GRANT SELECT ON worker_time_entries_detail TO authenticated;
GRANT SELECT ON worker_task_reports_detail TO anon;
GRANT SELECT ON worker_task_reports_detail TO authenticated;

-- Note: RLS policies are NOT used because this system uses custom authentication
-- Security is enforced at the application level:
-- - All queries filter by worker_id from the logged-in user's session
-- - Frontend components pass user.id to queries
-- - Server-side filtering ensures workers only see their own data
-- 
-- Example security measures in the application:
-- - WorkerScheduleView: .eq('worker_id', user.id)
-- - WorkOrders: .eq('assigned_to', workerId) when workerMode=true
-- - ProductsManagement: .eq('default_location_type', locationFilter)
-- - TimeTrackingPanel: worker_id set to user.id on insert
