-- Migration to fix timeout issues with treatment_milk_loss_summary and vw_animal_profitability views
-- This migration adds indexes and optimizes views to prevent statement timeouts

-- Add indexes to improve GEA data lookups on the ACTUAL TABLES (not the view)
-- gea_daily_cows_joined is a VIEW, so we index the underlying tables

-- Index on gea_daily_ataskaita1 for ear_number lookups
CREATE INDEX IF NOT EXISTS idx_gea_ataskaita1_ear_number_import 
  ON gea_daily_ataskaita1(ear_number, import_id);

-- Index on gea_daily_ataskaita2 for milk data lookups
CREATE INDEX IF NOT EXISTS idx_gea_ataskaita2_cow_number_milk 
  ON gea_daily_ataskaita2(cow_number, import_id) 
  WHERE avg_milk_prod_weight IS NOT NULL AND avg_milk_prod_weight > 0;

-- Index on gea_daily_imports for timestamp lookups
CREATE INDEX IF NOT EXISTS idx_gea_imports_created_at 
  ON gea_daily_imports(created_at DESC);

-- Add index on treatments for better filtering
CREATE INDEX IF NOT EXISTS idx_treatments_animal_withdrawal_date 
  ON treatments(animal_id, withdrawal_until_milk, reg_date) 
  WHERE withdrawal_until_milk IS NOT NULL;

-- Recreate treatment_milk_loss_summary with better performance
-- Use LATERAL join which allows PostgreSQL to push down WHERE filters effectively
DROP VIEW IF EXISTS treatment_milk_loss_summary CASCADE;

CREATE OR REPLACE VIEW treatment_milk_loss_summary AS
SELECT
  t.id as treatment_id,
  t.animal_id,
  a.tag_no as animal_tag,
  t.reg_date as treatment_date,
  t.withdrawal_until_milk,
  t.withdrawal_until_meat,
  t.clinical_diagnosis,
  t.vet_name,
  (t.withdrawal_until_milk - t.reg_date) as withdrawal_days,
  1 as safety_days,
  (t.withdrawal_until_milk - t.reg_date) + 1 as total_loss_days,
  COALESCE(lgm.avg_milk, 0) as avg_daily_milk_kg,
  COALESCE(lgm.avg_milk, 0) * ((t.withdrawal_until_milk - t.reg_date) + 1) as total_milk_lost_kg,
  COALESCE((SELECT setting_value::numeric FROM system_settings WHERE setting_key = 'milk_price_per_liter' LIMIT 1), 0.45) as milk_price_eur_per_kg,
  (COALESCE(lgm.avg_milk, 0) * ((t.withdrawal_until_milk - t.reg_date) + 1)) * 
    COALESCE((SELECT setting_value::numeric FROM system_settings WHERE setting_key = 'milk_price_per_liter' LIMIT 1), 0.45) as total_value_lost_eur,
  COALESCE((
    SELECT json_agg(json_build_object(
      'product_id', ui.product_id,
      'product_name', p.name,
      'qty', ui.qty,
      'unit', ui.unit,
      'withdrawal_milk_days', p.withdrawal_days_milk,
      'withdrawal_meat_days', p.withdrawal_days_meat
    ) ORDER BY p.name)
    FROM usage_items ui
    JOIN products p ON p.id = ui.product_id
    WHERE ui.treatment_id = t.id
      AND p.category = 'medicines'
  ), '[]'::json) as medications_used
FROM treatments t
JOIN animals a ON a.id = t.animal_id
LEFT JOIN LATERAL (
  -- Get most recent milk data for this specific animal
  -- PostgreSQL can push down filters here when animal_id is specified in WHERE clause
  SELECT COALESCE(gea.avg_milk_prod_weight, 0) as avg_milk
  FROM gea_daily_cows_joined gea
  WHERE gea.ear_number = a.tag_no
    AND gea.avg_milk_prod_weight IS NOT NULL
    AND gea.avg_milk_prod_weight > 0
  ORDER BY gea.import_created_at DESC
  LIMIT 1
) lgm ON true
WHERE t.withdrawal_until_milk IS NOT NULL
  AND (t.withdrawal_until_milk - t.reg_date) + 1 > 0
ORDER BY t.reg_date DESC;

COMMENT ON VIEW treatment_milk_loss_summary IS 'Treatment milk loss analysis with LATERAL join for optimal filter pushdown and performance';

-- Optimize vw_animal_profitability view
-- Simplify CTEs and reduce expensive operations
DROP VIEW IF EXISTS vw_animal_profitability CASCADE;

CREATE OR REPLACE VIEW vw_animal_profitability AS
WITH animal_gea_data AS (
  -- Pre-compute GEA data per animal with a simpler query
  SELECT 
    a.id as animal_id,
    a.tag_no,
    (SELECT gea.cow_number 
     FROM gea_daily_cows_joined gea 
     WHERE gea.ear_number = a.tag_no 
     ORDER BY gea.import_created_at DESC 
     LIMIT 1) as collar_no,
    COALESCE((SELECT gea.lactation_days 
     FROM gea_daily_cows_joined gea 
     WHERE gea.ear_number = a.tag_no 
     ORDER BY gea.import_created_at DESC 
     LIMIT 1), 0) as lactation_days,
    COALESCE((SELECT gea.avg_milk_prod_weight 
     FROM gea_daily_cows_joined gea 
     WHERE gea.ear_number = a.tag_no 
       AND gea.avg_milk_prod_weight IS NOT NULL 
       AND gea.avg_milk_prod_weight > 0
     ORDER BY gea.import_created_at DESC 
     LIMIT 1), 0) as avg_daily_milk,
    (SELECT gea.produce_milk 
     FROM gea_daily_cows_joined gea 
     WHERE gea.ear_number = a.tag_no 
     ORDER BY gea.import_created_at DESC 
     LIMIT 1) as is_producing,
    (SELECT gea.group_number 
     FROM gea_daily_cows_joined gea 
     WHERE gea.ear_number = a.tag_no 
     ORDER BY gea.import_created_at DESC 
     LIMIT 1) as current_group,
    (SELECT gea.cow_state 
     FROM gea_daily_cows_joined gea 
     WHERE gea.ear_number = a.tag_no 
     ORDER BY gea.import_created_at DESC 
     LIMIT 1) as current_status
  FROM animals a
  WHERE a.active = true
),
animal_metrics AS (
  SELECT
    agd.*,
    GREATEST(1, agd.lactation_days) as days_tracked,
    agd.avg_daily_milk * GREATEST(1, agd.lactation_days) as total_milk_liters
  FROM animal_gea_data agd
),
animal_treatment_costs AS (
  SELECT
    t.animal_id,
    COUNT(DISTINCT t.id) as treatment_count,
    COALESCE(SUM(
      (SELECT COALESCE(SUM(ui.qty * COALESCE(b.purchase_price / NULLIF(b.received_qty, 0), 0)), 0)
       FROM usage_items ui
       LEFT JOIN batches b ON ui.batch_id = b.id
       WHERE ui.treatment_id = t.id)
    ), 0) as medication_costs
  FROM treatments t
  GROUP BY t.animal_id
),
animal_vaccination_costs AS (
  SELECT
    v.animal_id,
    COUNT(*) as vaccination_count,
    COALESCE(SUM(v.dose_amount * COALESCE(b.purchase_price / NULLIF(b.received_qty, 0), 0)), 0) as vaccination_costs
  FROM vaccinations v
  LEFT JOIN batches b ON v.batch_id = b.id
  GROUP BY v.animal_id
),
animal_visit_costs AS (
  SELECT
    v.animal_id,
    COUNT(DISTINCT v.id) as visit_count,
    (COUNT(DISTINCT v.id) * 10) as visit_costs
  FROM animal_visits v
  WHERE v.animal_id IS NOT NULL
  GROUP BY v.animal_id
),
animal_withdrawal AS (
  SELECT
    t.animal_id,
    COUNT(DISTINCT t.id) FILTER (WHERE t.withdrawal_until_milk >= CURRENT_DATE) as days_in_withdrawal,
    COALESCE(SUM(
      CASE 
        WHEN t.withdrawal_until_milk >= CURRENT_DATE 
        THEN (t.withdrawal_until_milk - t.reg_date) * 
             COALESCE(get_animal_avg_milk_at_date(t.animal_id, t.reg_date), 0) * 
             COALESCE((SELECT setting_value::numeric FROM system_settings WHERE setting_key = 'milk_price_per_liter' LIMIT 1), 0.45)
        ELSE 0
      END
    ), 0) as withdrawal_revenue_loss
  FROM treatments t
  GROUP BY t.animal_id
)
SELECT
  am.animal_id,
  am.tag_no,
  am.collar_no,
  am.days_tracked,
  am.total_milk_liters,
  am.avg_daily_milk,
  (am.total_milk_liters * COALESCE((SELECT setting_value::numeric FROM system_settings WHERE setting_key = 'milk_price_per_liter' LIMIT 1), 0.45)) as milk_revenue,
  COALESCE(aw.withdrawal_revenue_loss, 0) as withdrawal_revenue_loss,
  (am.total_milk_liters * COALESCE((SELECT setting_value::numeric FROM system_settings WHERE setting_key = 'milk_price_per_liter' LIMIT 1), 0.45)) - COALESCE(aw.withdrawal_revenue_loss, 0) as adjusted_milk_revenue,
  COALESCE(atc.treatment_count, 0) as treatment_count,
  COALESCE(avc.vaccination_count, 0) as vaccination_count,
  COALESCE(avic.visit_count, 0) as visit_count,
  COALESCE(atc.medication_costs, 0) + COALESCE(avc.vaccination_costs, 0) as medication_costs,
  COALESCE(avic.visit_costs, 0) as visit_costs,
  COALESCE(atc.medication_costs, 0) + COALESCE(avc.vaccination_costs, 0) + COALESCE(avic.visit_costs, 0) as total_costs,
  ((am.total_milk_liters * COALESCE((SELECT setting_value::numeric FROM system_settings WHERE setting_key = 'milk_price_per_liter' LIMIT 1), 0.45)) - COALESCE(aw.withdrawal_revenue_loss, 0)) - (COALESCE(atc.medication_costs, 0) + COALESCE(avc.vaccination_costs, 0) + COALESCE(avic.visit_costs, 0)) as net_profit,
  CASE 
    WHEN (COALESCE(atc.medication_costs, 0) + COALESCE(avc.vaccination_costs, 0) + COALESCE(avic.visit_costs, 0)) > 0
    THEN (((am.total_milk_liters * COALESCE((SELECT setting_value::numeric FROM system_settings WHERE setting_key = 'milk_price_per_liter' LIMIT 1), 0.45)) - COALESCE(aw.withdrawal_revenue_loss, 0)) - (COALESCE(atc.medication_costs, 0) + COALESCE(avc.vaccination_costs, 0) + COALESCE(avic.visit_costs, 0))) / NULLIF((COALESCE(atc.medication_costs, 0) + COALESCE(avc.vaccination_costs, 0) + COALESCE(avic.visit_costs, 0)), 0) * 100
    ELSE NULL
  END as roi_percentage,
  CASE 
    WHEN (am.total_milk_liters * COALESCE((SELECT setting_value::numeric FROM system_settings WHERE setting_key = 'milk_price_per_liter' LIMIT 1), 0.45)) > 0
    THEN (COALESCE(atc.medication_costs, 0) + COALESCE(avc.vaccination_costs, 0) + COALESCE(avic.visit_costs, 0)) / NULLIF((am.total_milk_liters * COALESCE((SELECT setting_value::numeric FROM system_settings WHERE setting_key = 'milk_price_per_liter' LIMIT 1), 0.45)), 0)
    ELSE NULL
  END as cost_to_revenue_ratio,
  am.lactation_days,
  am.current_group,
  am.current_status,
  am.is_producing,
  COALESCE(aw.days_in_withdrawal, 0) as days_in_withdrawal
FROM animal_metrics am
LEFT JOIN animal_treatment_costs atc ON am.animal_id = atc.animal_id
LEFT JOIN animal_vaccination_costs avc ON am.animal_id = avc.animal_id
LEFT JOIN animal_visit_costs avic ON am.animal_id = avic.animal_id
LEFT JOIN animal_withdrawal aw ON am.animal_id = aw.animal_id
WHERE am.lactation_days > 0 OR atc.treatment_count > 0;

COMMENT ON VIEW vw_animal_profitability IS 'Profitability analysis per animal including milk revenue, treatment costs, and ROI - optimized to prevent timeouts';

-- Add index for synchronizations view
CREATE INDEX IF NOT EXISTS idx_animal_synchronizations_animal_status 
  ON animal_synchronizations(animal_id, status, start_date);

-- Add indexes for synchronization steps
CREATE INDEX IF NOT EXISTS idx_synchronization_steps_sync_id 
  ON synchronization_steps(synchronization_id, scheduled_date DESC);

-- Optimize animal_milk_loss_by_synchronization view
-- This view also has the CROSS JOIN LATERAL issue causing 502 errors
DROP VIEW IF EXISTS animal_milk_loss_by_synchronization CASCADE;

CREATE OR REPLACE VIEW animal_milk_loss_by_synchronization AS
WITH sync_end_dates AS (
  -- Pre-compute end dates for all active synchronizations
  SELECT 
    synchronization_id,
    MAX(scheduled_date) as max_date
  FROM synchronization_steps
  GROUP BY synchronization_id
)
SELECT
  a.id AS animal_id,
  a.tag_no AS animal_number,
  NULL::text AS animal_name,
  s.id AS sync_id,
  s.start_date AS sync_start,
  s.status AS sync_status,
  s.protocol_id,
  sp.name AS protocol_name,
  COALESCE(sed.max_date, s.start_date + INTERVAL '14 days')::date AS sync_end,
  (COALESCE(sed.max_date, s.start_date + INTERVAL '14 days')::date - s.start_date) + 1 AS loss_days,
  -- Get avg milk using LATERAL for this specific animal
  COALESCE(lgm.avg_milk, 0) AS avg_daily_milk_kg,
  COALESCE(lgm.avg_milk, 0) * ((COALESCE(sed.max_date, s.start_date + INTERVAL '14 days')::date - s.start_date) + 1) AS total_milk_lost_kg,
  (COALESCE(lgm.avg_milk, 0) * ((COALESCE(sed.max_date, s.start_date + INTERVAL '14 days')::date - s.start_date) + 1)) * 
    COALESCE((SELECT setting_value::numeric FROM system_settings WHERE setting_key = 'milk_price_per_liter' LIMIT 1), 0.45) AS milk_loss_value_eur,
  COALESCE((SELECT setting_value::numeric FROM system_settings WHERE setting_key = 'milk_price_per_liter' LIMIT 1), 0.45) AS milk_price_used
FROM animals a
JOIN animal_synchronizations s ON s.animal_id = a.id
LEFT JOIN synchronization_protocols sp ON sp.id = s.protocol_id
LEFT JOIN sync_end_dates sed ON sed.synchronization_id = s.id
LEFT JOIN LATERAL (
  -- Get most recent milk data before synchronization started
  SELECT COALESCE(gea.avg_milk_prod_weight, 0) as avg_milk
  FROM gea_daily_cows_joined gea
  WHERE gea.ear_number = a.tag_no
    AND gea.import_created_at < s.start_date
    AND gea.avg_milk_prod_weight IS NOT NULL
    AND gea.avg_milk_prod_weight > 0
  ORDER BY gea.import_created_at DESC
  LIMIT 1
) lgm ON true
WHERE s.status = ANY (ARRAY['Active'::text, 'Completed'::text])
  AND (COALESCE(sed.max_date, s.start_date + INTERVAL '14 days')::date - s.start_date) + 1 > 0
ORDER BY s.start_date DESC, a.tag_no;

COMMENT ON VIEW animal_milk_loss_by_synchronization IS 'Aggregates milk loss data by animal and synchronization with optimized LATERAL joins';

-- Fix RLS policies for system_settings (needed by views to access milk price)
-- The 406 error on system_settings is because anon role doesn't have SELECT policy
DROP POLICY IF EXISTS "Allow anon to read settings" ON system_settings;
CREATE POLICY "Allow anon to read settings" 
  ON system_settings FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Allow service_role to read settings" ON system_settings;
CREATE POLICY "Allow service_role to read settings" 
  ON system_settings FOR SELECT TO service_role USING (true);

-- Grant permissions
GRANT SELECT ON treatment_milk_loss_summary TO anon, authenticated, service_role;
GRANT SELECT ON vw_animal_profitability TO anon, authenticated, service_role;
GRANT SELECT ON animal_milk_loss_by_synchronization TO anon, authenticated, service_role;

-- Add helpful comments
COMMENT ON INDEX idx_gea_ataskaita1_ear_number_import IS 'Speeds up ear_number lookups in gea_daily_cows_joined view';
COMMENT ON INDEX idx_gea_ataskaita2_cow_number_milk IS 'Speeds up milk production queries in gea_daily_cows_joined view';
COMMENT ON INDEX idx_gea_imports_created_at IS 'Speeds up timestamp ordering in gea_daily_cows_joined view';
COMMENT ON INDEX idx_treatments_animal_withdrawal_date IS 'Optimizes treatment milk loss queries by animal';
COMMENT ON INDEX idx_animal_synchronizations_animal_status IS 'Optimizes synchronization queries by animal';
COMMENT ON INDEX idx_synchronization_steps_sync_id IS 'Speeds up synchronization step lookups and date calculations';
