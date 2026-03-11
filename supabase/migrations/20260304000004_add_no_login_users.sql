-- Add requires_login column to users table
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS requires_login BOOLEAN DEFAULT true;

-- Update existing users to require login
UPDATE users SET requires_login = true WHERE requires_login IS NULL;

-- Add comment
COMMENT ON COLUMN users.requires_login IS 'Whether the user needs email/password to sign in. False for workers who only appear in schedules.';
