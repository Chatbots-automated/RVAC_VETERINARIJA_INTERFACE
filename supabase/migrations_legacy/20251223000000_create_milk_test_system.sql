/*
  # Milk Test Results System

  1. New Tables
    - `milk_scrape_sessions`
      - Tracks when data was scraped from external source
      - `id` (uuid, primary key)
      - `scraped_at` (timestamptz) - when the scrape happened
      - `url` (text) - source URL
      - `date_from` (date) - test period start
      - `date_to` (date) - test period end
      - `created_at` (timestamptz)

    - `milk_producers`
      - Stores producer information (farms that supply milk)
      - `id` (uuid, primary key)
      - `gamintojo_id` (text, unique) - external producer ID (e.g., "881989")
      - `gamintojas_code` (text) - producer code (e.g., "41982-1")
      - `label` (text) - label like "naktinis" (night) or "rytinis" (morning)
      - `imone` (text) - company name
      - `rajonas` (text) - region
      - `punktas` (text) - collection point
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `milk_composition_tests`
      - Stores milk composition test results (fat, protein, lactose, etc.)
      - `id` (uuid, primary key)
      - `producer_id` (uuid, FK) - reference to milk_producers
      - `scrape_session_id` (uuid, FK) - reference to milk_scrape_sessions
      - `paemimo_data` (date) - collection date
      - `atvezimo_data` (date) - delivery date
      - `tyrimo_data` (date) - test date
      - `riebalu_kiekis` (decimal) - fat content %
      - `baltymu_kiekis` (decimal) - protein content %
      - `laktozes_kiekis` (decimal) - lactose content %
      - `persk_koef` (decimal) - conversion coefficient
      - `ureja_mg_100ml` (integer) - urea mg/100ml
      - `ph` (decimal) - pH level
      - `pastaba` (text) - notes
      - `konteineris` (text) - container ID
      - `plomba` (text) - seal number
      - `prot_nr` (text) - protocol number
      - `created_at` (timestamptz)

    - `milk_quality_tests`
      - Stores milk quality test results (somatic cells, bacteria count)
      - `id` (uuid, primary key)
      - `producer_id` (uuid, FK) - reference to milk_producers
      - `scrape_session_id` (uuid, FK) - reference to milk_scrape_sessions
      - `paemimo_data` (date) - collection date
      - `atvezimo_data` (date) - delivery date
      - `tyrimo_data` (date) - test date
      - `somatiniu_lasteliu_skaicius` (integer) - somatic cell count (thousand/ml)
      - `bendras_bakteriju_skaicius` (integer) - total bacteria count (thousand/ml)
      - `neatit_pst` (text) - non-compliance PST
      - `konteineris` (text) - container ID
      - `plomba` (text) - seal number
      - `prot_nr` (text) - protocol number
      - `created_at` (timestamptz)

    - `milk_test_summaries`
      - Stores summary/average data for producers and collection points
      - `id` (uuid, primary key)
      - `producer_id` (uuid, FK, nullable) - reference to milk_producers
      - `scrape_session_id` (uuid, FK) - reference to milk_scrape_sessions
      - `summary_type` (text) - 'gamintojo' (producer) or 'punktas' (point)
      - `label` (text) - display label (e.g., "41982.Gamintojo vid.")
      - `test_type` (text) - 'composition' or 'quality'
      - `data` (jsonb) - flexible storage for summary values
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to read and manage their data

  3. Indexes
    - Add indexes on frequently queried columns for performance
*/

-- Create milk scrape sessions table
CREATE TABLE IF NOT EXISTS milk_scrape_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scraped_at timestamptz NOT NULL,
  url text NOT NULL,
  date_from date NOT NULL,
  date_to date NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create milk producers table
CREATE TABLE IF NOT EXISTS milk_producers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gamintojo_id text UNIQUE NOT NULL,
  gamintojas_code text NOT NULL,
  label text NOT NULL,
  imone text NOT NULL,
  rajonas text NOT NULL,
  punktas text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create milk composition tests table
CREATE TABLE IF NOT EXISTS milk_composition_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producer_id uuid REFERENCES milk_producers(id) ON DELETE CASCADE,
  scrape_session_id uuid REFERENCES milk_scrape_sessions(id) ON DELETE CASCADE,
  paemimo_data date NOT NULL,
  atvezimo_data date NOT NULL,
  tyrimo_data date NOT NULL,
  riebalu_kiekis decimal(5,2),
  baltymu_kiekis decimal(5,2),
  laktozes_kiekis decimal(5,2),
  persk_koef decimal(6,3),
  ureja_mg_100ml integer,
  ph decimal(4,2),
  pastaba text DEFAULT '',
  konteineris text NOT NULL,
  plomba text DEFAULT '',
  prot_nr text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(producer_id, paemimo_data, konteineris)
);

-- Create milk quality tests table
CREATE TABLE IF NOT EXISTS milk_quality_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producer_id uuid REFERENCES milk_producers(id) ON DELETE CASCADE,
  scrape_session_id uuid REFERENCES milk_scrape_sessions(id) ON DELETE CASCADE,
  paemimo_data date NOT NULL,
  atvezimo_data date NOT NULL,
  tyrimo_data date NOT NULL,
  somatiniu_lasteliu_skaicius integer,
  bendras_bakteriju_skaicius integer,
  neatit_pst text DEFAULT '',
  konteineris text NOT NULL,
  plomba text DEFAULT '',
  prot_nr text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(producer_id, paemimo_data, konteineris)
);

-- Create milk test summaries table
CREATE TABLE IF NOT EXISTS milk_test_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producer_id uuid REFERENCES milk_producers(id) ON DELETE CASCADE,
  scrape_session_id uuid REFERENCES milk_scrape_sessions(id) ON DELETE CASCADE,
  summary_type text NOT NULL CHECK (summary_type IN ('gamintojo', 'punktas')),
  label text NOT NULL,
  test_type text NOT NULL CHECK (test_type IN ('composition', 'quality')),
  data jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE milk_scrape_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE milk_producers ENABLE ROW LEVEL SECURITY;
ALTER TABLE milk_composition_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE milk_quality_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE milk_test_summaries ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users
CREATE POLICY "Authenticated users can view scrape sessions"
  ON milk_scrape_sessions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert scrape sessions"
  ON milk_scrape_sessions FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can view producers"
  ON milk_producers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert producers"
  ON milk_producers FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update producers"
  ON milk_producers FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can view composition tests"
  ON milk_composition_tests FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert composition tests"
  ON milk_composition_tests FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update composition tests"
  ON milk_composition_tests FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete composition tests"
  ON milk_composition_tests FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can view quality tests"
  ON milk_quality_tests FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert quality tests"
  ON milk_quality_tests FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update quality tests"
  ON milk_quality_tests FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete quality tests"
  ON milk_quality_tests FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can view summaries"
  ON milk_test_summaries FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert summaries"
  ON milk_test_summaries FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_milk_composition_tests_producer_id ON milk_composition_tests(producer_id);
CREATE INDEX IF NOT EXISTS idx_milk_composition_tests_scrape_session_id ON milk_composition_tests(scrape_session_id);
CREATE INDEX IF NOT EXISTS idx_milk_composition_tests_dates ON milk_composition_tests(paemimo_data, tyrimo_data);
CREATE INDEX IF NOT EXISTS idx_milk_composition_tests_konteineris ON milk_composition_tests(konteineris);

CREATE INDEX IF NOT EXISTS idx_milk_quality_tests_producer_id ON milk_quality_tests(producer_id);
CREATE INDEX IF NOT EXISTS idx_milk_quality_tests_scrape_session_id ON milk_quality_tests(scrape_session_id);
CREATE INDEX IF NOT EXISTS idx_milk_quality_tests_dates ON milk_quality_tests(paemimo_data, tyrimo_data);
CREATE INDEX IF NOT EXISTS idx_milk_quality_tests_konteineris ON milk_quality_tests(konteineris);

CREATE INDEX IF NOT EXISTS idx_milk_producers_gamintojo_id ON milk_producers(gamintojo_id);
CREATE INDEX IF NOT EXISTS idx_milk_test_summaries_producer_id ON milk_test_summaries(producer_id);
CREATE INDEX IF NOT EXISTS idx_milk_test_summaries_scrape_session_id ON milk_test_summaries(scrape_session_id);

-- Enable realtime for these tables
ALTER PUBLICATION supabase_realtime ADD TABLE milk_scrape_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE milk_producers;
ALTER PUBLICATION supabase_realtime ADD TABLE milk_composition_tests;
ALTER PUBLICATION supabase_realtime ADD TABLE milk_quality_tests;
ALTER PUBLICATION supabase_realtime ADD TABLE milk_test_summaries;
