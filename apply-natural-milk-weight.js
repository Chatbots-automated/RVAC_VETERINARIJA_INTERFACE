import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const migration = `
/*
  # Natural Milk Weight Calculation System

  1. Schema Changes
    - Add columns to milk_production table:
      - scale_weight_kg (decimal) - Raw weight from scale
      - scale_timestamp_lt (timestamptz) - Scale reading timestamp in local time
      - recalculation_coefficient (decimal) - Conversion coefficient based on composition
      - natural_weight_kg (decimal) - Adjusted weight (scale_weight × coefficient)

  2. Constants
    - Base fat: 3.4%
    - Base protein: 3.0%

  3. Formula
    - Coefficient = (0.4 × fat% + 0.6 × protein%) / (0.4 × 3.4 + 0.6 × 3.0)
    - Natural Weight = Scale Weight × Coefficient

  4. Functions
    - calculate_natural_milk_weight() - Auto-calculates natural weight

  5. Triggers
    - Updates natural weight when scale data or composition changes
*/

-- Add new columns to milk_production table
ALTER TABLE milk_production
  ADD COLUMN IF NOT EXISTS scale_weight_kg decimal(8,2),
  ADD COLUMN IF NOT EXISTS scale_timestamp_lt timestamptz,
  ADD COLUMN IF NOT EXISTS recalculation_coefficient decimal(6,4),
  ADD COLUMN IF NOT EXISTS natural_weight_kg decimal(8,2);

-- Add comment explaining the columns
COMMENT ON COLUMN milk_production.scale_weight_kg IS 'Raw weight from scale in kg';
COMMENT ON COLUMN milk_production.scale_timestamp_lt IS 'Timestamp from scale in Europe/Vilnius timezone';
COMMENT ON COLUMN milk_production.recalculation_coefficient IS 'Coefficient = (0.4×fat + 0.6×protein) / (0.4×3.4 + 0.6×3.0)';
COMMENT ON COLUMN milk_production.natural_weight_kg IS 'Adjusted natural milk weight = scale_weight_kg × recalculation_coefficient';
COMMENT ON COLUMN milk_production.weight_kg IS 'Legacy weight field or manually entered weight';

-- Function to calculate natural milk weight
CREATE OR REPLACE FUNCTION calculate_natural_milk_weight(
  prod_id uuid
) RETURNS void AS $$
DECLARE
  base_fat constant decimal := 3.4;
  base_protein constant decimal := 3.0;
  scale_weight decimal;
  fat_percent decimal;
  protein_percent decimal;
  coefficient decimal;
  natural_weight decimal;
BEGIN
  -- Get scale weight for this production record
  SELECT mp.scale_weight_kg
  INTO scale_weight
  FROM milk_production mp
  WHERE mp.id = prod_id;

  -- If no scale weight, exit
  IF scale_weight IS NULL THEN
    RETURN;
  END IF;

  -- Get latest composition test for this container and date
  SELECT mct.riebalu_kiekis, mct.baltymu_kiekis
  INTO fat_percent, protein_percent
  FROM milk_production mp
  LEFT JOIN milk_composition_tests mct
    ON mp.konteineris = mct.konteineris
    AND mp.production_date = mct.paemimo_data
  WHERE mp.id = prod_id
  ORDER BY mct.tyrimo_data DESC
  LIMIT 1;

  -- If no composition data, exit
  IF fat_percent IS NULL OR protein_percent IS NULL THEN
    UPDATE milk_production
    SET recalculation_coefficient = NULL,
        natural_weight_kg = NULL
    WHERE id = prod_id;
    RETURN;
  END IF;

  -- Calculate coefficient
  -- Formula: (0.4 × fat% + 0.6 × protein%) / (0.4 × 3.4 + 0.6 × 3.0)
  coefficient := (0.4 * fat_percent + 0.6 * protein_percent) / (0.4 * base_fat + 0.6 * base_protein);

  -- Calculate natural weight
  natural_weight := scale_weight * coefficient;

  -- Update the production record
  UPDATE milk_production
  SET recalculation_coefficient = ROUND(coefficient, 4),
      natural_weight_kg = ROUND(natural_weight, 2)
  WHERE id = prod_id;
END;
$$ LANGUAGE plpgsql;

-- Trigger function to auto-calculate natural weight
CREATE OR REPLACE FUNCTION trigger_calculate_natural_milk_weight()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate natural weight for the updated/inserted record
  PERFORM calculate_natural_milk_weight(NEW.id);

  -- Refresh the NEW record to get updated values
  SELECT recalculation_coefficient, natural_weight_kg
  INTO NEW.recalculation_coefficient, NEW.natural_weight_kg
  FROM milk_production
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on milk_production for when scale weight changes
DROP TRIGGER IF EXISTS trigger_milk_production_natural_weight ON milk_production;
CREATE TRIGGER trigger_milk_production_natural_weight
  AFTER INSERT OR UPDATE OF scale_weight_kg, konteineris, production_date
  ON milk_production
  FOR EACH ROW
  WHEN (NEW.scale_weight_kg IS NOT NULL)
  EXECUTE FUNCTION trigger_calculate_natural_milk_weight();

-- Trigger function to recalculate natural weight when composition changes
CREATE OR REPLACE FUNCTION trigger_recalculate_on_composition_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Recalculate for all production records matching this composition test
  PERFORM calculate_natural_milk_weight(mp.id)
  FROM milk_production mp
  WHERE mp.konteineris = NEW.konteineris
    AND mp.production_date = NEW.paemimo_data;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on composition tests
DROP TRIGGER IF EXISTS trigger_composition_recalc_natural_weight ON milk_composition_tests;
CREATE TRIGGER trigger_composition_recalc_natural_weight
  AFTER INSERT OR UPDATE OF riebalu_kiekis, baltymu_kiekis
  ON milk_composition_tests
  FOR EACH ROW
  EXECUTE FUNCTION trigger_recalculate_on_composition_change();

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_milk_production_natural_weight ON milk_production(natural_weight_kg)
  WHERE natural_weight_kg IS NOT NULL;

-- Update the analytics view to include natural weight
DROP VIEW IF EXISTS milk_producer_analytics;
CREATE OR REPLACE VIEW milk_producer_analytics AS
WITH latest_production AS (
  SELECT DISTINCT ON (producer_id)
    producer_id,
    production_date,
    weight_kg,
    scale_weight_kg,
    natural_weight_kg,
    recalculation_coefficient,
    temperature_c,
    konteineris
  FROM milk_production
  ORDER BY producer_id, production_date DESC
),
production_stats AS (
  SELECT
    producer_id,
    COUNT(*) as total_deliveries,
    SUM(COALESCE(natural_weight_kg, weight_kg)) as total_kg,
    AVG(COALESCE(natural_weight_kg, weight_kg)) as avg_kg_per_delivery,
    SUM(natural_weight_kg) as total_natural_kg,
    AVG(natural_weight_kg) as avg_natural_kg_per_delivery,
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
  lp.scale_weight_kg as last_scale_weight_kg,
  lp.natural_weight_kg as last_natural_weight_kg,
  lp.recalculation_coefficient as last_coefficient,
  lp.temperature_c as last_temperature,
  COALESCE(ps.total_deliveries, 0) as total_deliveries,
  COALESCE(ps.total_kg, 0) as total_kg_produced,
  COALESCE(ps.avg_kg_per_delivery, 0) as avg_kg_per_delivery,
  COALESCE(ps.total_natural_kg, 0) as total_natural_kg_produced,
  COALESCE(ps.avg_natural_kg_per_delivery, 0) as avg_natural_kg_per_delivery,
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
    COALESCE(lp.natural_weight_kg, lp.weight_kg),
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
`;

async function applyMigration() {
  try {
    console.log('Applying natural milk weight calculation migration...\n');

    // Execute the entire migration as one SQL statement
    const { error } = await supabase.rpc('exec', { sql: migration });

    if (error) {
      // Try alternative approach: use fetch API to post to the database REST API
      console.log('Trying alternative method...');

      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({ query: migration })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    }

    console.log('Migration applied successfully!');
    console.log('\nNew columns added to milk_production:');
    console.log('  - scale_weight_kg (raw weight from scale)');
    console.log('  - scale_timestamp_lt (timestamp in Europe/Vilnius)');
    console.log('  - recalculation_coefficient (conversion coefficient)');
    console.log('  - natural_weight_kg (adjusted weight)');
    console.log('\nFormula: natural_weight_kg = scale_weight_kg × coefficient');
    console.log('Where: coefficient = (0.4×fat + 0.6×protein) / (0.4×3.4 + 0.6×3.0)');
    console.log('\nTriggers created:');
    console.log('  - Auto-calculates when scale_weight_kg is inserted/updated');
    console.log('  - Recalculates when composition test data changes');

  } catch (error) {
    console.error('Migration failed:', error);
    console.error('\nPlease run the SQL migration manually in Supabase SQL Editor.');
    console.error('The migration SQL is in the file: apply-natural-milk-weight.js');
    process.exit(1);
  }
}

applyMigration();
