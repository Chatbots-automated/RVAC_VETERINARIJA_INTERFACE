/*
  # Create worker schedules system

  1. New Tables
    - `worker_schedules`
      - `id` (uuid, primary key)
      - `worker_id` (uuid, references users)
      - `date` (date)
      - `shift_start` (time)
      - `shift_end` (time)
      - `schedule_type` (text) - work, off, vacation, sick, training
      - `notes` (text)
      - `created_at` (timestamptz)
      - `created_by` (uuid, references users)

  2. Security
    - Enable RLS on `worker_schedules` table
    - Add policy for authenticated users to manage schedules
*/

CREATE TABLE IF NOT EXISTS worker_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  date date NOT NULL,
  shift_start time,
  shift_end time,
  schedule_type text NOT NULL DEFAULT 'work',
  notes text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES users(id)
);

ALTER TABLE worker_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view schedules"
  ON worker_schedules FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert schedules"
  ON worker_schedules FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update schedules"
  ON worker_schedules FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete schedules"
  ON worker_schedules FOR DELETE
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_worker_schedules_worker_date ON worker_schedules(worker_id, date);
CREATE INDEX IF NOT EXISTS idx_worker_schedules_date ON worker_schedules(date);
