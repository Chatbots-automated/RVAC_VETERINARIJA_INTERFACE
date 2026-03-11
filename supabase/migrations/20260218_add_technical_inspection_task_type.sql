-- Add 'technical_inspection' to the allowed task types in worker_task_reports
-- This allows warehouse workers to report on technical inspection and insurance tasks

ALTER TABLE worker_task_reports 
DROP CONSTRAINT IF EXISTS worker_task_reports_task_type_check;

ALTER TABLE worker_task_reports 
ADD CONSTRAINT worker_task_reports_task_type_check 
CHECK (task_type IN ('work_order', 'maintenance_schedule', 'farm_equipment_service', 'technical_inspection'));

COMMENT ON CONSTRAINT worker_task_reports_task_type_check ON worker_task_reports IS 
'Allowed task types: work_order (repair tasks), maintenance_schedule (vehicle maintenance), farm_equipment_service (farm equipment), technical_inspection (TA and insurance)';
