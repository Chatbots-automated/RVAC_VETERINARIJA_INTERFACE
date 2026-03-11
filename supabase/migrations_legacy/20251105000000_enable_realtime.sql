/*
  # Enable Real-time Subscriptions

  1. Enable Real-time
    - Enable real-time for all critical tables to support multi-user concurrent access
    - Tables: animals, animal_visits, treatments, usage_items, vaccinations, batches, products, inventory_transactions, biocide_usage, users

  2. Benefits
    - Automatic updates across all connected clients
    - No need for manual refresh
    - Supports 20+ concurrent users
    - Immediate data synchronization
*/

-- Enable real-time for animals table
ALTER PUBLICATION supabase_realtime ADD TABLE animals;

-- Enable real-time for animal_visits table
ALTER PUBLICATION supabase_realtime ADD TABLE animal_visits;

-- Enable real-time for treatments table
ALTER PUBLICATION supabase_realtime ADD TABLE treatments;

-- Enable real-time for usage_items table
ALTER PUBLICATION supabase_realtime ADD TABLE usage_items;

-- Enable real-time for vaccinations table
ALTER PUBLICATION supabase_realtime ADD TABLE vaccinations;

-- Enable real-time for batches table
ALTER PUBLICATION supabase_realtime ADD TABLE batches;

-- Enable real-time for products table
ALTER PUBLICATION supabase_realtime ADD TABLE products;

-- Enable real-time for inventory_transactions table (if exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'inventory_transactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE inventory_transactions;
  END IF;
END $$;

-- Enable real-time for biocide_usage table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'biocide_usage'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE biocide_usage;
  END IF;
END $$;

-- Enable real-time for users table
ALTER PUBLICATION supabase_realtime ADD TABLE users;

-- Enable real-time for diseases table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'diseases'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE diseases;
  END IF;
END $$;

-- Enable real-time for suppliers table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'suppliers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE suppliers;
  END IF;
END $$;

-- Enable real-time for medical_waste table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'medical_waste'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE medical_waste;
  END IF;
END $$;
