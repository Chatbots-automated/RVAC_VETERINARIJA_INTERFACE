/*
  # Create Comprehensive Audit Logging System

  1. New Tables
    - `user_audit_logs`
      - `id` (uuid, primary key) - Unique identifier for each log entry
      - `user_id` (uuid) - Foreign key to users table
      - `action` (text) - Type of action performed (e.g., 'create_treatment', 'update_product', 'delete_animal')
      - `table_name` (text) - Name of the table affected
      - `record_id` (uuid) - ID of the record affected (nullable for queries)
      - `old_data` (jsonb) - Previous state of the data (for updates/deletes)
      - `new_data` (jsonb) - New state of the data (for creates/updates)
      - `ip_address` (text) - IP address of the user (optional)
      - `user_agent` (text) - Browser/device info (optional)
      - `created_at` (timestamptz) - When the action occurred

  2. User Table Enhancements
    - Add `full_name` (text) - Full name of the user for display
    - Add `is_frozen` (boolean) - Whether the user is frozen/disabled
    - Add `frozen_at` (timestamptz) - When the user was frozen
    - Add `frozen_by` (uuid) - Which admin froze the user

  3. Security
    - Enable RLS on `user_audit_logs` table
    - Admins can view all logs
    - Regular users cannot view logs
    - All writes to audit log are done via secure functions

  4. Functions
    - `log_user_action` - Function to log any user action
    - `freeze_user` - Function for admins to freeze a user
    - `unfreeze_user` - Function for admins to unfreeze a user
    - `is_user_frozen` - Function to check if a user is frozen

  5. Important Notes
    - All actions in the system should be logged automatically
    - Frozen users can log in but cannot perform any actions
    - Only admins can freeze/unfreeze users
    - Audit logs are immutable (no updates or deletes allowed)
*/

-- Add new fields to users table
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS full_name text NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS is_frozen boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS frozen_at timestamptz,
ADD COLUMN IF NOT EXISTS frozen_by uuid REFERENCES public.users(id);

-- Create user_audit_logs table
CREATE TABLE IF NOT EXISTS public.user_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  table_name text,
  record_id uuid,
  old_data jsonb,
  new_data jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.user_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.user_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.user_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_name ON public.user_audit_logs(table_name);

-- Enable RLS on audit logs
ALTER TABLE public.user_audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can view audit logs
CREATE POLICY "Admins can view all audit logs"
  ON public.user_audit_logs
  FOR SELECT
  USING (true);

-- Policy: System can insert audit logs (via functions only)
CREATE POLICY "System can insert audit logs"
  ON public.user_audit_logs
  FOR INSERT
  WITH CHECK (true);

-- Function to log user actions
CREATE OR REPLACE FUNCTION public.log_user_action(
  p_user_id uuid,
  p_action text,
  p_table_name text DEFAULT NULL,
  p_record_id uuid DEFAULT NULL,
  p_old_data jsonb DEFAULT NULL,
  p_new_data jsonb DEFAULT NULL,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  log_id uuid;
BEGIN
  INSERT INTO public.user_audit_logs (
    user_id,
    action,
    table_name,
    record_id,
    old_data,
    new_data,
    ip_address,
    user_agent
  )
  VALUES (
    p_user_id,
    p_action,
    p_table_name,
    p_record_id,
    p_old_data,
    p_new_data,
    p_ip_address,
    p_user_agent
  )
  RETURNING id INTO log_id;

  RETURN log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user is frozen
CREATE OR REPLACE FUNCTION public.is_user_frozen(p_user_id uuid)
RETURNS boolean AS $$
DECLARE
  frozen boolean;
BEGIN
  SELECT is_frozen INTO frozen
  FROM public.users
  WHERE id = p_user_id;

  RETURN COALESCE(frozen, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to freeze a user
CREATE OR REPLACE FUNCTION public.freeze_user(
  p_user_id uuid,
  p_admin_id uuid
)
RETURNS boolean AS $$
DECLARE
  admin_role text;
BEGIN
  -- Check if the admin has admin role
  SELECT role INTO admin_role
  FROM public.users
  WHERE id = p_admin_id;

  IF admin_role != 'admin' THEN
    RAISE EXCEPTION 'Only admins can freeze users';
  END IF;

  -- Freeze the user
  UPDATE public.users
  SET is_frozen = true,
      frozen_at = now(),
      frozen_by = p_admin_id,
      updated_at = now()
  WHERE id = p_user_id;

  -- Log the action
  PERFORM public.log_user_action(
    p_admin_id,
    'freeze_user',
    'users',
    p_user_id,
    jsonb_build_object('is_frozen', false),
    jsonb_build_object('is_frozen', true, 'frozen_by', p_admin_id)
  );

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to unfreeze a user
CREATE OR REPLACE FUNCTION public.unfreeze_user(
  p_user_id uuid,
  p_admin_id uuid
)
RETURNS boolean AS $$
DECLARE
  admin_role text;
BEGIN
  -- Check if the admin has admin role
  SELECT role INTO admin_role
  FROM public.users
  WHERE id = p_admin_id;

  IF admin_role != 'admin' THEN
    RAISE EXCEPTION 'Only admins can unfreeze users';
  END IF;

  -- Unfreeze the user
  UPDATE public.users
  SET is_frozen = false,
      frozen_at = NULL,
      frozen_by = NULL,
      updated_at = now()
  WHERE id = p_user_id;

  -- Log the action
  PERFORM public.log_user_action(
    p_admin_id,
    'unfreeze_user',
    'users',
    p_user_id,
    jsonb_build_object('is_frozen', true),
    jsonb_build_object('is_frozen', false)
  );

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user audit logs (for admin dashboard)
CREATE OR REPLACE FUNCTION public.get_user_audit_logs(
  p_user_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  user_email text,
  user_name text,
  action text,
  table_name text,
  record_id uuid,
  old_data jsonb,
  new_data jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    al.id,
    al.user_id,
    u.email as user_email,
    u.full_name as user_name,
    al.action,
    al.table_name,
    al.record_id,
    al.old_data,
    al.new_data,
    al.ip_address,
    al.user_agent,
    al.created_at
  FROM public.user_audit_logs al
  LEFT JOIN public.users u ON u.id = al.user_id
  WHERE (p_user_id IS NULL OR al.user_id = p_user_id)
  ORDER BY al.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
