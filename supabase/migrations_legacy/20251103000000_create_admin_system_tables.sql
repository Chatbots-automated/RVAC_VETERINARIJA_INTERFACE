/*
  # Create Admin System Tables

  1. New Tables
    - `user_sessions`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `session_token` (text)
      - `ip_address` (text)
      - `user_agent` (text)
      - `created_at` (timestamptz)
      - `last_active_at` (timestamptz)
      - `expires_at` (timestamptz)
      - `is_active` (boolean)

    - `failed_login_attempts`
      - `id` (uuid, primary key)
      - `email` (text)
      - `ip_address` (text)
      - `user_agent` (text)
      - `reason` (text)
      - `attempted_at` (timestamptz)

    - `system_settings`
      - `id` (uuid, primary key)
      - `setting_key` (text, unique)
      - `setting_value` (jsonb)
      - `description` (text)
      - `updated_at` (timestamptz)
      - `updated_by` (uuid, references auth.users)

    - `suspicious_activities`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `activity_type` (text)
      - `description` (text)
      - `severity` (text)
      - `ip_address` (text)
      - `metadata` (jsonb)
      - `detected_at` (timestamptz)
      - `resolved` (boolean)

  2. Security
    - Enable RLS on all tables
    - Only admins can access these tables
*/

-- Create user_sessions table
CREATE TABLE IF NOT EXISTS user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  session_token text NOT NULL,
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now(),
  last_active_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL,
  is_active boolean DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions(is_active, expires_at);

ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all sessions"
  ON user_sessions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Users can view own sessions"
  ON user_sessions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Create failed_login_attempts table
CREATE TABLE IF NOT EXISTS failed_login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  ip_address text,
  user_agent text,
  reason text,
  attempted_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_failed_logins_email ON failed_login_attempts(email);
CREATE INDEX IF NOT EXISTS idx_failed_logins_ip ON failed_login_attempts(ip_address);
CREATE INDEX IF NOT EXISTS idx_failed_logins_attempted_at ON failed_login_attempts(attempted_at DESC);

ALTER TABLE failed_login_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can view failed login attempts"
  ON failed_login_attempts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- Create system_settings table
CREATE TABLE IF NOT EXISTS system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text UNIQUE NOT NULL,
  setting_value jsonb NOT NULL,
  description text,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can view system settings"
  ON system_settings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Only admins can update system settings"
  ON system_settings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Only admins can insert system settings"
  ON system_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- Create suspicious_activities table
CREATE TABLE IF NOT EXISTS suspicious_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  activity_type text NOT NULL,
  description text,
  severity text DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  ip_address text,
  metadata jsonb,
  detected_at timestamptz DEFAULT now(),
  resolved boolean DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_suspicious_activities_user_id ON suspicious_activities(user_id);
CREATE INDEX IF NOT EXISTS idx_suspicious_activities_severity ON suspicious_activities(severity, resolved);
CREATE INDEX IF NOT EXISTS idx_suspicious_activities_detected_at ON suspicious_activities(detected_at DESC);

ALTER TABLE suspicious_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can view suspicious activities"
  ON suspicious_activities FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Only admins can update suspicious activities"
  ON suspicious_activities FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- Insert default system settings
INSERT INTO system_settings (setting_key, setting_value, description)
VALUES
  ('max_failed_login_attempts', '5', 'Maximum failed login attempts before account freeze'),
  ('session_timeout_minutes', '480', 'Session timeout in minutes (8 hours)'),
  ('suspicious_activity_threshold', '10', 'Number of suspicious actions before alert'),
  ('enable_ip_tracking', 'true', 'Enable IP address tracking for security')
ON CONFLICT (setting_key) DO NOTHING;

-- Function to clean up old sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE user_sessions
  SET is_active = false
  WHERE expires_at < now() AND is_active = true;
END;
$$;

-- Function to detect suspicious activity
CREATE OR REPLACE FUNCTION detect_suspicious_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  recent_count integer;
  user_email text;
BEGIN
  -- Check for rapid successive actions (more than 50 in 1 minute)
  SELECT COUNT(*) INTO recent_count
  FROM user_audit_logs
  WHERE user_id = NEW.user_id
  AND created_at > now() - interval '1 minute';

  IF recent_count > 50 THEN
    SELECT email INTO user_email FROM auth.users WHERE id = NEW.user_id;

    INSERT INTO suspicious_activities (
      user_id,
      activity_type,
      description,
      severity,
      metadata
    ) VALUES (
      NEW.user_id,
      'rapid_actions',
      'User performed ' || recent_count || ' actions in 1 minute',
      'high',
      jsonb_build_object('action_count', recent_count, 'email', user_email)
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger for suspicious activity detection
DROP TRIGGER IF EXISTS trigger_detect_suspicious_activity ON user_audit_logs;
CREATE TRIGGER trigger_detect_suspicious_activity
  AFTER INSERT ON user_audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION detect_suspicious_activity();
