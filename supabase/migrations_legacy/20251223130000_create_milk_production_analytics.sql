/*
  # Milk Production Tracking and Analytics System

  1. New Tables
    - `milk_production`
      - Tracks actual milk production weights from farm scales
      - Links to test data via konteineris field

  2. Views
    - `milk_producer_analytics`
      - Comprehensive analytics per producer

  3. Functions
    - `calculate_milk_payment` - Payment estimates
      Note: SCC and bacteria values in DB are already in thousands
      (e.g., 197 = 197k cells/ml)

  4. Security
    - RLS policies for authenticated users

  5. Indexes
    - Performance indexes on key fields
*/

-- Create milk production tracking table
CREATE TABLE IF NOT EXISTS milk_production (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producer_id uuid REFERENCES milk_producers(id) ON DELETE CASCADE,
  konteineris text NOT NULL,
  production_date date NOT NULL,
  weight_kg decimal(8,2) NOT NULL CHECK (weight_kg > 0),
  temperature_c decimal(4,1),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(konteineris, production_date)
);

-- Enable RLS
ALTER TABLE milk_production ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Authenticated users can view production"
  ON milk_production FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert production"
  ON milk_production FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update production"
  ON milk_production FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete production"
  ON milk_production FOR DELETE
  TO authenticated
  USING (true);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_milk_production_producer_id ON milk_production(producer_id);
CREATE INDEX IF NOT EXISTS idx_milk_production_konteineris ON milk_production(konteineris);
CREATE INDEX IF NOT EXISTS idx_milk_production_date ON milk_production(production_date);
CREATE INDEX IF NOT EXISTS idx_milk_production_recorded_at ON milk_production(recorded_at);

-- Function to calculate payment estimate
-- NOTE: scc_count and bacteria_count are already in thousands (k)
-- e.g., scc_count=197 means 197,000 cells/ml
CREATE OR REPLACE FUNCTION calculate_milk_payment(
  weight_kg decimal,
  fat_percent decimal,
  protein_percent decimal,
  scc_count_k integer,
  bacteria_count_k integer
) RETURNS decimal AS $$
DECLARE
  base_price decimal := 0.45;
  quality_multiplier decimal := 1.0;
  composition_bonus decimal := 0.0;
  final_price decimal;
BEGIN
  -- Quality adjustments based on SCC (already in thousands)
  -- Excellent: < 200k = +5%
  -- Good: 200k-400k = no change
  -- Fair: 400k-600k = -5%
  -- Poor: > 600k = -15%
  IF scc_count_k IS NOT NULL THEN
    IF scc_count_k < 200 THEN
      quality_multiplier := quality_multiplier + 0.05;
    ELSIF scc_count_k >= 400 AND scc_count_k < 600 THEN
      quality_multiplier := quality_multiplier - 0.05;
    ELSIF scc_count_k >= 600 THEN
      quality_multiplier := quality_multiplier - 0.15;
    END IF;
  END IF;

  -- Bacteria count adjustments (already in thousands)
  -- Excellent: < 100k = +2%
  -- Good: 100k-300k = no change
  -- Poor: > 300k = -5%
  IF bacteria_count_k IS NOT NULL THEN
    IF bacteria_count_k < 100 THEN
      quality_multiplier := quality_multiplier + 0.02;
    ELSIF bacteria_count_k > 300 THEN
      quality_multiplier := quality_multiplier - 0.05;
    END IF;
  END IF;

  -- Composition bonuses
  -- Fat: +0.01 EUR per 0.1% above 3.5%
  -- Protein: +0.015 EUR per 0.1% above 3.2%
  IF fat_percent IS NOT NULL AND fat_percent > 3.5 THEN
    composition_bonus := composition_bonus + ((fat_percent - 3.5) * 0.1);
  END IF;

  IF protein_percent IS NOT NULL AND protein_percent > 3.2 THEN
    composition_bonus := composition_bonus + ((protein_percent - 3.2) * 0.15);
  END IF;

  -- Calculate final price
  final_price := weight_kg * (base_price * quality_multiplier + composition_bonus);

  RETURN ROUND(final_price, 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create comprehensive analytics view
CREATE OR REPLACE VIEW milk_producer_analytics AS
WITH latest_production AS (
  SELECT DISTINCT ON (producer_id)
    producer_id,
    production_date,
    weight_kg,
    temperature_c,
    konteineris
  FROM milk_production
  ORDER BY producer_id, production_date DESC
),
production_stats AS (
  SELECT
    producer_id,
    COUNT(*) as total_deliveries,
    SUM(weight_kg) as total_kg,
    AVG(weight_kg) as avg_kg_per_delivery,
    MIN(production_date) as first_delivery,
    MAX(production_date) as last_delivery
  FROM milk_production
  GROUP BY producer_id
),
latest_composition AS (
  SELECT DISTINCT ON (producer_id)
    producer_id,
    riebalu_kiekis,
    baltymu_kiekis,
    laktozes_kiekis,
    ureja_mg_100ml,
    ph,
    paemimo_data
  FROM milk_composition_tests
  ORDER BY producer_id, tyrimo_data DESC
),
composition_stats AS (
  SELECT
    producer_id,
    AVG(riebalu_kiekis) as avg_fat,
    AVG(baltymu_kiekis) as avg_protein,
    AVG(laktozes_kiekis) as avg_lactose,
    AVG(ureja_mg_100ml) as avg_urea,
    STDDEV(riebalu_kiekis) as stddev_fat,
    STDDEV(baltymu_kiekis) as stddev_protein
  FROM milk_composition_tests
  WHERE tyrimo_data >= CURRENT_DATE - INTERVAL '30 days'
  GROUP BY producer_id
),
latest_quality AS (
  SELECT DISTINCT ON (producer_id)
    producer_id,
    somatiniu_lasteliu_skaicius,
    bendras_bakteriju_skaicius,
    paemimo_data
  FROM milk_quality_tests
  ORDER BY producer_id, tyrimo_data DESC
),
quality_stats AS (
  SELECT
    producer_id,
    AVG(somatiniu_lasteliu_skaicius) as avg_scc,
    AVG(bendras_bakteriju_skaicius) as avg_bacteria,
    MIN(somatiniu_lasteliu_skaicius) as min_scc,
    MAX(somatiniu_lasteliu_skaicius) as max_scc
  FROM milk_quality_tests
  WHERE tyrimo_data >= CURRENT_DATE - INTERVAL '30 days'
  GROUP BY producer_id
)
SELECT
  p.id as producer_id,
  p.gamintojo_id,
  p.gamintojas_code,
  p.label,
  p.imone,
  p.rajonas,
  p.punktas,
  lp.production_date as last_production_date,
  lp.weight_kg as last_production_kg,
  lp.temperature_c as last_temperature,
  COALESCE(ps.total_deliveries, 0) as total_deliveries,
  COALESCE(ps.total_kg, 0) as total_kg_produced,
  COALESCE(ps.avg_kg_per_delivery, 0) as avg_kg_per_delivery,
  ps.first_delivery,
  ps.last_delivery,
  lc.riebalu_kiekis as current_fat_percent,
  lc.baltymu_kiekis as current_protein_percent,
  lc.laktozes_kiekis as current_lactose_percent,
  lc.ureja_mg_100ml as current_urea,
  lc.ph as current_ph,
  cs.avg_fat as avg_fat_30d,
  cs.avg_protein as avg_protein_30d,
  cs.avg_lactose as avg_lactose_30d,
  cs.stddev_fat as stddev_fat_30d,
  cs.stddev_protein as stddev_protein_30d,
  lq.somatiniu_lasteliu_skaicius as current_scc,
  lq.bendras_bakteriju_skaicius as current_bacteria,
  qs.avg_scc as avg_scc_30d,
  qs.avg_bacteria as avg_bacteria_30d,
  qs.min_scc as min_scc_30d,
  qs.max_scc as max_scc_30d,
  CASE
    WHEN lq.somatiniu_lasteliu_skaicius < 200 THEN 'Puiki'
    WHEN lq.somatiniu_lasteliu_skaicius < 400 THEN 'Gera'
    WHEN lq.somatiniu_lasteliu_skaicius < 600 THEN 'Vidutinė'
    ELSE 'Bloga'
  END as quality_status,
  calculate_milk_payment(
    lp.weight_kg,
    lc.riebalu_kiekis,
    lc.baltymu_kiekis,
    lq.somatiniu_lasteliu_skaicius,
    lq.bendras_bakteriju_skaicius
  ) as estimated_last_payment_eur,
  p.updated_at
FROM milk_producers p
LEFT JOIN latest_production lp ON p.id = lp.producer_id
LEFT JOIN production_stats ps ON p.id = ps.producer_id
LEFT JOIN latest_composition lc ON p.id = lc.producer_id
LEFT JOIN composition_stats cs ON p.id = cs.producer_id
LEFT JOIN latest_quality lq ON p.id = lq.producer_id
LEFT JOIN quality_stats qs ON p.id = qs.producer_id;

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE milk_production;
