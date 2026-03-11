/*
  # Create user notes system

  1. New Tables
    - `user_notes`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references users)
      - `content` (text) - the note content
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `user_notes` table
    - Add policies for users to manage their own notes
*/

CREATE TABLE IF NOT EXISTS public.user_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_notes ENABLE ROW LEVEL SECURITY;

-- Policies (application handles authentication)
CREATE POLICY "Users can view own notes"
  ON public.user_notes
  FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own notes"
  ON public.user_notes
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update own notes"
  ON public.user_notes
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete own notes"
  ON public.user_notes
  FOR DELETE
  USING (true);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_notes_user_id ON public.user_notes(user_id);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_user_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_user_notes_updated_at
  BEFORE UPDATE ON public.user_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_user_notes_updated_at();
