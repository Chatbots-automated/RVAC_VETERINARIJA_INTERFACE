-- Make email column nullable for no-login users
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

-- Make password_hash nullable (since no-login users won't have a password)
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- Add a check constraint to ensure that if requires_login is true, email and password must be present
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_required_check;
ALTER TABLE users ADD CONSTRAINT users_email_required_check 
  CHECK (
    (requires_login = true AND email IS NOT NULL AND password_hash IS NOT NULL) OR 
    (requires_login = false)
  );
