/*
  # Add Product Subcategories

  1. Schema Changes
    - Add `subcategory` text column to `products` table
    - Add `subcategory_2` text column to `products` table for nested subcategories

  2. Subcategory Structure
    - **vaistai** (medicines):
      - Level 1: Gydomieji preparatai, Gydymo medziagos, Vakcinos
      - Level 2 (under Gydomieji preparatai and Gydymo medziagos):
        - Antimikrobines medziagos
        - Gydomieji papildai
        - Hormoniniai preparatai
        - Kiti medikamentai

    - **reprodukcija**:
      - Buliai
      - Seklinimo priemones

    - **higiena**:
      - Biocidai
      - Kitos priemones

  3. Notes
    - Subcategories are optional (nullable)
    - Will be used for better analytics and filtering
    - No default values to maintain data integrity
*/

-- Add subcategory columns to products table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'subcategory'
  ) THEN
    ALTER TABLE products ADD COLUMN subcategory text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'subcategory_2'
  ) THEN
    ALTER TABLE products ADD COLUMN subcategory_2 text;
  END IF;
END $$;

-- Add comments for documentation
COMMENT ON COLUMN products.subcategory IS 'Primary subcategory (e.g., Gydomieji preparatai, Buliai, Biocidai)';
COMMENT ON COLUMN products.subcategory_2 IS 'Secondary subcategory for nested classifications (e.g., Antimikrobines medziagos)';
