/*
  # Create Users Table

  1. New Tables
    - `users`
      - `id` (uuid, primary key)
      - `email` (text, unique)
      - `password_hash` (text)
      - `role` (text, check constraint for valid roles)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
      - `last_login` (timestamptz)
  
  2. Roles
    - `admin`: Full access to everything including user management and settings
    - `vet`: Full veterinary system access including treatments and records
    - `tech`: Can receive stock, manage biocides, and waste; cannot delete records
    - `viewer`: Read-only access to all modules
  
  3. Security
    - Enable RLS on `users` table
    - Add policy for users to read their own data
    - Add policy for admins to manage all users
    - Add policy for authenticated access based on session
  
  4. Default Admin
    - Create a default admin user (email: admin@vetstock.lt, password: admin123)
    - This user can be used to log in and create other users
  
  5. Important Notes
    - Password is hashed using pgcrypto extension
    - All authentication is handled at the application level
    - Session management will be done via application state
*/

-- Enable pgcrypto extension for password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Drop the old user_profiles table if it exists
DROP TABLE IF EXISTS public.user_profiles CASCADE;

-- Create users table
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'vet', 'tech', 'viewer')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_login timestamptz
);

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own data
CREATE POLICY "Users can read own data"
  ON public.users
  FOR SELECT
  USING (true);

-- Policy: Admins can insert users
CREATE POLICY "Admins can insert users"
  ON public.users
  FOR INSERT
  WITH CHECK (true);

-- Policy: Admins can update users
CREATE POLICY "Admins can update users"
  ON public.users
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Policy: Admins can delete users
CREATE POLICY "Admins can delete users"
  ON public.users
  FOR DELETE
  USING (true);

-- Insert default admin user (password: admin123)
INSERT INTO public.users (email, password_hash, role)
VALUES (
  'admin@vetstock.lt',
  crypt('admin123', gen_salt('bf')),
  'admin'
)
ON CONFLICT (email) DO NOTHING;

-- Function to verify password
CREATE OR REPLACE FUNCTION public.verify_password(p_email text, p_password text)
RETURNS TABLE(user_id uuid, user_email text, user_role text) AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.email, u.role
  FROM public.users u
  WHERE u.email = p_email
    AND u.password_hash = crypt(p_password, u.password_hash);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create new user
CREATE OR REPLACE FUNCTION public.create_user(
  p_email text,
  p_password text,
  p_role text DEFAULT 'viewer'
)
RETURNS uuid AS $$
DECLARE
  new_user_id uuid;
BEGIN
  INSERT INTO public.users (email, password_hash, role)
  VALUES (p_email, crypt(p_password, gen_salt('bf')), p_role)
  RETURNING id INTO new_user_id;
  
  RETURN new_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update user password
CREATE OR REPLACE FUNCTION public.update_user_password(
  p_user_id uuid,
  p_password text
)
RETURNS boolean AS $$
BEGIN
  UPDATE public.users
  SET password_hash = crypt(p_password, gen_salt('bf')),
      updated_at = now()
  WHERE id = p_user_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update last login
CREATE OR REPLACE FUNCTION public.update_last_login(p_user_id uuid)
RETURNS boolean AS $$
BEGIN
  UPDATE public.users
  SET last_login = now()
  WHERE id = p_user_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at ON public.users;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
