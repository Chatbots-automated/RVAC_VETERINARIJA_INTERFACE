/*
  # Add Missing Product Categories to Enum

  1. Changes
    - Add 'svirkstukai' to product_category enum
    - Add 'bolusas' to product_category enum
    - Add 'vakcina' to product_category enum
    - These are used in the application but missing from the database enum

  2. Notes
    - Uses IF NOT EXISTS logic to safely add enum values
    - Each value is added only if it doesn't already exist
*/

-- Add svirkstukai to product_category enum if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'svirkstukai'
    AND enumtypid = 'product_category'::regtype
  ) THEN
    ALTER TYPE product_category ADD VALUE 'svirkstukai';
  END IF;
END $$;

-- Add bolusas to product_category enum if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'bolusas'
    AND enumtypid = 'product_category'::regtype
  ) THEN
    ALTER TYPE product_category ADD VALUE 'bolusas';
  END IF;
END $$;

-- Add vakcina to product_category enum if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'vakcina'
    AND enumtypid = 'product_category'::regtype
  ) THEN
    ALTER TYPE product_category ADD VALUE 'vakcina';
  END IF;
END $$;
