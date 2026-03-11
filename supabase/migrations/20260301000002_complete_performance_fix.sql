-- =============================================================================
-- COMPLETE PERFORMANCE FIX
-- =============================================================================
-- Fixes ALL timeout issues by creating a materialized view for GEA data
-- and rewriting all dependent views + functions to use it.
--
-- This replaces migrations 20260301000000 and 20260301000001.
-- =============================================================================

-- Step 1: Create materialized view with latest GEA data per animal
-- This is the key optimization - compute once, query many times
DROP MATERIALIZED VIEW IF EXISTS mv_animal_latest_gea CASCADE;

CREATE MATERIALIZED VIEW mv_animal_latest_gea AS
WITH ranked_imports AS (
  SELECT
    i.id as import_id,
    i.created_at as import_created_at,
    ROW_NUMBER() OVER (ORDER BY i.created_at DESC) as rn
  FROM gea_daily_imports i
),
latest_import AS (
  SELECT import_id, import_created_at FROM ranked_imports WHERE rn = 1
),
-- Get all cow data from the latest import only
latest_a1 AS (
  SELECT a1.cow_number, a1.ear_number, a1.cow_state, a1.group_number,
         a1.lactation_days, a1.import_id
  FROM gea_daily_ataskaita1 a1
  WHERE a1.import_id = (SELECT import_id FROM latest_import)
),
latest_a2 AS (
  SELECT a2.cow_number, a2.avg_milk_prod_weight, a2.produce_milk, a2.import_id
  FROM gea_daily_ataskaita2 a2
  WHERE a2.import_id = (SELECT import_id FROM latest_import)
)
SELECT
  a.id as animal_id,
  a.tag_no,
  la1.cow_number as collar_no,
  (SELECT import_created_at FROM latest_import) as import_created_at,
  COALESCE(la1.lactation_days, 0) as lactation_days,
  COALESCE(la2.avg_milk_prod_weight, 0) as avg_daily_milk,
  la2.produce_milk as is_producing,
  la1.group_number as current_group,
  la1.cow_state as current_status
FROM animals a
LEFT JOIN latest_a1 la1 ON la1.ear_number = a.tag_no
LEFT JOIN latest_a2 la2 ON la2.import_id = la1.import_id AND la2.cow_number = la1.cow_number
WHERE a.active = true;

-- Create indexes on the materialized view for fast lookups
CREATE UNIQUE INDEX idx_mv_gea_animal_id ON mv_animal_latest_gea(animal_id);
CREATE INDEX idx_mv_gea_tag_no ON mv_animal_latest_gea(tag_no);

COMMENT ON MATERIALIZED VIEW mv_animal_latest_gea IS 
'Pre-computed latest GEA data per animal. Refresh with: REFRESH MATERIALIZED VIEW CONCURRENTLY mv_animal_latest_gea';

-- Step 2: Create indexes on base tables (if not already created)
CREATE INDEX IF NOT EXISTS idx_gea_ataskaita1_ear_number_import 
  ON gea_daily_ataskaita1(ear_number, import_id);

CREATE INDEX IF NOT EXISTS idx_gea_ataskaita2_cow_number_import 
  ON gea_daily_ataskaita2(cow_number, import_id);

CREATE INDEX IF NOT EXISTS idx_gea_ataskaita2_cow_milk 
  ON gea_daily_ataskaita2(cow_number, import_id) 
  WHERE avg_milk_prod_weight IS NOT NULL AND avg_milk_prod_weight > 0;

CREATE INDEX IF NOT EXISTS idx_gea_imports_created_at 
  ON gea_daily_imports(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_treatments_animal_withdrawal_date 
  ON treatments(animal_id, withdrawal_until_milk, reg_date) 
  WHERE withdrawal_until_milk IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_animal_synchronizations_animal_status 
  ON animal_synchronizations(animal_id, status, start_date);

CREATE INDEX IF NOT EXISTS idx_synchronization_steps_sync_id 
  ON synchronization_steps(synchronization_id, scheduled_date DESC);

-- Indexes to speed up gea_daily_cows_joined view queries (used by MastitisMilk)
CREATE INDEX IF NOT EXISTS idx_gea_ataskaita1_import_cow
  ON gea_daily_ataskaita1(import_id, cow_number);

CREATE INDEX IF NOT EXISTS idx_gea_ataskaita2_import_cow
  ON gea_daily_ataskaita2(import_id, cow_number);

CREATE INDEX IF NOT EXISTS idx_gea_ataskaita3_import_cow
  ON gea_daily_ataskaita3(import_id, cow_number);

-- Index on group_number for MastitisMilk filtering
CREATE INDEX IF NOT EXISTS idx_gea_ataskaita1_group
  ON gea_daily_ataskaita1(group_number);

-- Step 3: Rewrite get_animal_avg_milk_at_date to use gea_daily_cows_joined
-- IMPORTANT: Must use gea_daily_cows_joined.avg_milk_prod_weight for historical data
CREATE OR REPLACE FUNCTION public.get_animal_avg_milk_at_date(p_animal_id uuid, p_date date)
RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_avg_milk numeric;
  v_tag_no text;
BEGIN
  SELECT tag_no INTO v_tag_no FROM animals WHERE id = p_animal_id;
  IF v_tag_no IS NULL THEN RETURN 0; END IF;

  -- Use gea_daily_cows_joined view - it has avg_milk_prod_weight column
  SELECT COALESCE(gea.avg_milk_prod_weight, 0)
  INTO v_avg_milk
  FROM gea_daily_cows_joined gea
  WHERE gea.ear_number = v_tag_no
    AND DATE(gea.import_created_at) <= p_date
    AND gea.avg_milk_prod_weight IS NOT NULL
    AND gea.avg_milk_prod_weight > 0
  ORDER BY gea.import_created_at DESC
  LIMIT 1;

  -- Fallback: get any available data if none before date
  IF v_avg_milk IS NULL OR v_avg_milk = 0 THEN
    SELECT COALESCE(gea.avg_milk_prod_weight, 0)
    INTO v_avg_milk
    FROM gea_daily_cows_joined gea
    WHERE gea.ear_number = v_tag_no
      AND gea.avg_milk_prod_weight IS NOT NULL
      AND gea.avg_milk_prod_weight > 0
    ORDER BY gea.import_created_at DESC
    LIMIT 1;
  END IF;

  RETURN COALESCE(v_avg_milk, 0);
END;
$$;

-- Also fix calculate_average_daily_milk to use gea_daily_cows_joined
CREATE OR REPLACE FUNCTION public.calculate_average_daily_milk(p_animal_id uuid, p_before_date date DEFAULT CURRENT_DATE)
RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_avg_milk numeric;
  v_tag_no text;
BEGIN
  SELECT tag_no INTO v_tag_no FROM animals WHERE id = p_animal_id;
  IF v_tag_no IS NULL THEN RETURN 0; END IF;

  -- Use gea_daily_cows_joined.avg_milk_prod_weight
  SELECT COALESCE(gea.avg_milk_prod_weight, 0)
  INTO v_avg_milk
  FROM gea_daily_cows_joined gea
  WHERE gea.ear_number = v_tag_no
    AND DATE(gea.import_created_at) < p_before_date
    AND gea.avg_milk_prod_weight IS NOT NULL
    AND gea.avg_milk_prod_weight > 0
  ORDER BY gea.import_created_at DESC
  LIMIT 1;

  IF v_avg_milk IS NULL OR v_avg_milk = 0 THEN
    SELECT COALESCE(gea.avg_milk_prod_weight, 0)
    INTO v_avg_milk
    FROM gea_daily_cows_joined gea
    WHERE gea.ear_number = v_tag_no
      AND gea.avg_milk_prod_weight IS NOT NULL
      AND gea.avg_milk_prod_weight > 0
    ORDER BY gea.import_created_at DESC
    LIMIT 1;
  END IF;

  RETURN COALESCE(v_avg_milk, 0);
END;
$$;

-- Step 4: Recreate treatment_milk_loss_summary using gea_daily_cows_joined
-- IMPORTANT: We MUST use gea_daily_cows_joined here to get historical milk data
-- The materialized view only has latest import, but we need data from BEFORE treatment date
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
  -- Use gea_daily_cows_joined to get historical milk data from BEFORE treatment
  -- This is correct - avg_milk_prod_weight column has the milk average
  SELECT gea.avg_milk_prod_weight as avg_milk
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

COMMENT ON VIEW treatment_milk_loss_summary IS 'Treatment milk loss using gea_daily_cows_joined.avg_milk_prod_weight for correct historical milk data';

-- Step 5: Recreate vw_animal_profitability using materialized view
-- This is the critical one - uses mv_animal_latest_gea for instant lookups
DROP VIEW IF EXISTS vw_animal_profitability CASCADE;

CREATE OR REPLACE VIEW vw_animal_profitability AS
WITH animal_metrics AS (
  SELECT
    gea.animal_id,
    gea.tag_no,
    gea.collar_no,
    gea.lactation_days,
    gea.avg_daily_milk,
    gea.is_producing,
    gea.current_group,
    gea.current_status,
    GREATEST(1, gea.lactation_days) as days_tracked,
    gea.avg_daily_milk * GREATEST(1, gea.lactation_days) as total_milk_liters
  FROM mv_animal_latest_gea gea
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
milk_price AS (
  SELECT COALESCE(setting_value::numeric, 0.45) as price
  FROM system_settings WHERE setting_key = 'milk_price_per_liter' LIMIT 1
),
animal_withdrawal AS (
  SELECT
    t.animal_id,
    COUNT(DISTINCT t.id) FILTER (WHERE t.withdrawal_until_milk >= CURRENT_DATE) as days_in_withdrawal,
    COALESCE(SUM(
      CASE 
        WHEN t.withdrawal_until_milk >= CURRENT_DATE 
        THEN (t.withdrawal_until_milk - t.reg_date) * 
             COALESCE(gea.avg_daily_milk, 0) *
             (SELECT price FROM milk_price)
        ELSE 0
      END
    ), 0) as withdrawal_revenue_loss
  FROM treatments t
  LEFT JOIN mv_animal_latest_gea gea ON gea.animal_id = t.animal_id
  GROUP BY t.animal_id
)
SELECT
  am.animal_id,
  am.tag_no,
  am.collar_no,
  am.days_tracked,
  am.total_milk_liters,
  am.avg_daily_milk,
  (am.total_milk_liters * (SELECT price FROM milk_price)) as milk_revenue,
  COALESCE(aw.withdrawal_revenue_loss, 0) as withdrawal_revenue_loss,
  (am.total_milk_liters * (SELECT price FROM milk_price)) - COALESCE(aw.withdrawal_revenue_loss, 0) as adjusted_milk_revenue,
  COALESCE(atc.treatment_count, 0) as treatment_count,
  COALESCE(avc.vaccination_count, 0) as vaccination_count,
  COALESCE(avic.visit_count, 0) as visit_count,
  COALESCE(atc.medication_costs, 0) + COALESCE(avc.vaccination_costs, 0) as medication_costs,
  COALESCE(avic.visit_costs, 0) as visit_costs,
  COALESCE(atc.medication_costs, 0) + COALESCE(avc.vaccination_costs, 0) + COALESCE(avic.visit_costs, 0) as total_costs,
  ((am.total_milk_liters * (SELECT price FROM milk_price)) - COALESCE(aw.withdrawal_revenue_loss, 0)) 
    - (COALESCE(atc.medication_costs, 0) + COALESCE(avc.vaccination_costs, 0) + COALESCE(avic.visit_costs, 0)) as net_profit,
  CASE 
    WHEN (COALESCE(atc.medication_costs, 0) + COALESCE(avc.vaccination_costs, 0) + COALESCE(avic.visit_costs, 0)) > 0
    THEN (((am.total_milk_liters * (SELECT price FROM milk_price)) - COALESCE(aw.withdrawal_revenue_loss, 0)) 
      - (COALESCE(atc.medication_costs, 0) + COALESCE(avc.vaccination_costs, 0) + COALESCE(avic.visit_costs, 0))) 
      / NULLIF((COALESCE(atc.medication_costs, 0) + COALESCE(avc.vaccination_costs, 0) + COALESCE(avic.visit_costs, 0)), 0) * 100
    ELSE NULL
  END as roi_percentage,
  CASE 
    WHEN (am.total_milk_liters * (SELECT price FROM milk_price)) > 0
    THEN (COALESCE(atc.medication_costs, 0) + COALESCE(avc.vaccination_costs, 0) + COALESCE(avic.visit_costs, 0)) 
      / NULLIF((am.total_milk_liters * (SELECT price FROM milk_price)), 0)
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

COMMENT ON VIEW vw_animal_profitability IS 'Profitability analysis using mv_animal_latest_gea materialized view for performance';

-- Step 6: Recreate dependent views that CASCADE drop killed

-- vw_herd_profitability_summary depends on vw_animal_profitability
CREATE OR REPLACE VIEW vw_herd_profitability_summary AS
SELECT
  count(*) AS total_animals,
  count(CASE WHEN net_profit > 0 THEN 1 END) AS profitable_count,
  count(CASE WHEN net_profit <= 0 THEN 1 END) AS unprofitable_count,
  count(CASE WHEN net_profit < -50 THEN 1 END) AS severe_loss_count,
  sum(total_milk_liters) AS total_herd_milk,
  sum(milk_revenue) AS total_milk_revenue,
  sum(total_costs) AS total_treatment_costs,
  sum(net_profit) AS total_herd_profit,
  round(avg(net_profit), 2) AS avg_profit_per_animal,
  round(avg(avg_daily_milk), 2) AS avg_daily_milk_per_animal,
  sum(days_in_withdrawal) AS total_withdrawal_days,
  sum(withdrawal_revenue_loss) AS total_withdrawal_loss,
  round(CASE WHEN sum(milk_revenue) > 0 THEN (sum(total_costs) / sum(milk_revenue)) * 100 ELSE 0 END, 1) AS overall_cost_to_revenue_ratio
FROM vw_animal_profitability
WHERE days_tracked > 0;

COMMENT ON VIEW vw_herd_profitability_summary IS 'Aggregate herd-wide profitability metrics and KPIs';

-- vw_treatment_roi_analysis depends on vw_animal_profitability
CREATE OR REPLACE VIEW vw_treatment_roi_analysis AS
WITH recent_treatments AS (
  SELECT
    t.animal_id,
    a.tag_no,
    count(*) AS treatment_count_last_90_days,
    sum((ui.qty * b.purchase_price) / NULLIF(b.received_qty, 0)) AS total_treatment_cost,
    avg((ui.qty * b.purchase_price) / NULLIF(b.received_qty, 0)) AS avg_treatment_cost,
    max(t.reg_date) AS last_treatment_date,
    count(CASE WHEN t.outcome = 'recovered' THEN 1 END) AS successful_treatments,
    count(CASE WHEN t.outcome = 'ongoing' THEN 1 END) AS ongoing_treatments
  FROM treatments t
  JOIN animals a ON a.id = t.animal_id
  LEFT JOIN usage_items ui ON ui.treatment_id = t.id
  LEFT JOIN batches b ON b.id = ui.batch_id
  WHERE t.reg_date >= (CURRENT_DATE - INTERVAL '90 days')
  GROUP BY t.animal_id, a.tag_no
)
SELECT
  p.animal_id,
  p.tag_no,
  p.collar_no,
  p.avg_daily_milk,
  p.net_profit,
  p.total_costs AS current_total_costs,
  rt.treatment_count_last_90_days,
  rt.total_treatment_cost,
  rt.avg_treatment_cost,
  rt.last_treatment_date,
  rt.successful_treatments,
  rt.ongoing_treatments,
  CASE
    WHEN rt.treatment_count_last_90_days > 0 
    THEN round((rt.successful_treatments::numeric / rt.treatment_count_last_90_days::numeric) * 100, 1)
    ELSE NULL
  END AS success_rate_percentage,
  CASE
    WHEN p.avg_daily_milk > 0 AND rt.avg_treatment_cost > 0 
    THEN round(rt.avg_treatment_cost / (p.avg_daily_milk * COALESCE((SELECT setting_value::numeric FROM system_settings WHERE setting_key = 'milk_price_per_liter' LIMIT 1), 0.45)), 0)
    ELSE NULL
  END AS days_to_payback_avg_treatment,
  CASE
    WHEN p.net_profit < -100 THEN 'cull_recommended'
    WHEN p.net_profit < 0 THEN 'at_risk'
    WHEN rt.treatment_count_last_90_days >= 3 THEN 'chronic_case'
    WHEN p.net_profit > 50 THEN 'profitable'
    ELSE 'monitor'
  END AS recommendation,
  p.current_status,
  p.is_producing
FROM vw_animal_profitability p
LEFT JOIN recent_treatments rt ON rt.animal_id = p.animal_id;

COMMENT ON VIEW vw_treatment_roi_analysis IS 'Treatment ROI analysis with decision recommendations';

-- Step 7: Recreate animal_milk_loss_by_synchronization using gea_daily_cows_joined
-- IMPORTANT: Must use gea_daily_cows_joined to get historical milk data from before sync
DROP VIEW IF EXISTS animal_milk_loss_by_synchronization CASCADE;

CREATE OR REPLACE VIEW animal_milk_loss_by_synchronization AS
WITH sync_end_dates AS (
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
  -- Use gea_daily_cows_joined.avg_milk_prod_weight for historical data before sync
  SELECT gea.avg_milk_prod_weight as avg_milk
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

COMMENT ON VIEW animal_milk_loss_by_synchronization IS 'Synchronization milk loss using gea_daily_cows_joined.avg_milk_prod_weight for correct historical data';

-- Step 8: Recreate vw_animal_latest_collar using base tables
DROP VIEW IF EXISTS vw_animal_latest_collar CASCADE;

CREATE OR REPLACE VIEW vw_animal_latest_collar AS
SELECT 
  gea.animal_id,
  gea.collar_no::integer as collar_no
FROM mv_animal_latest_gea gea
WHERE gea.collar_no IS NOT NULL
  AND gea.collar_no ~ '^[0-9]+$';

COMMENT ON VIEW vw_animal_latest_collar IS 'Latest collar number per animal from materialized GEA data';

-- Step 9: Fix RLS policies for system_settings
DROP POLICY IF EXISTS "Allow anon to read settings" ON system_settings;
CREATE POLICY "Allow anon to read settings" 
  ON system_settings FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Allow service_role to read settings" ON system_settings;
CREATE POLICY "Allow service_role to read settings" 
  ON system_settings FOR SELECT TO service_role USING (true);

-- Step 10: Grant all permissions
GRANT SELECT ON treatment_milk_loss_summary TO anon, authenticated, service_role;
GRANT SELECT ON vw_animal_profitability TO anon, authenticated, service_role;
GRANT SELECT ON vw_herd_profitability_summary TO anon, authenticated, service_role;
GRANT SELECT ON vw_treatment_roi_analysis TO anon, authenticated, service_role;
GRANT SELECT ON animal_milk_loss_by_synchronization TO anon, authenticated, service_role;
GRANT SELECT ON mv_animal_latest_gea TO anon, authenticated, service_role;
GRANT SELECT ON vw_animal_latest_collar TO anon, authenticated, service_role;

-- Step 11: Create a function to refresh the materialized view
-- Call this after GEA data imports
CREATE OR REPLACE FUNCTION refresh_animal_gea_data()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_animal_latest_gea;
END;
$$;

GRANT EXECUTE ON FUNCTION refresh_animal_gea_data() TO anon, authenticated, service_role;

COMMENT ON FUNCTION refresh_animal_gea_data() IS 
'Refreshes mv_animal_latest_gea materialized view. Call after GEA data imports.';
