-- =============================================================================
-- RESTORE ORIGINAL VIEWS + ADD INDEXES
-- =============================================================================
-- The original views from baseline_public.sql worked fine.
-- The problem was they used the OLD gea_daily table which was dropped.
-- This migration restores them but adapted for the NEW GEA system.
-- =============================================================================

-- Step 1: Add all necessary indexes
CREATE INDEX IF NOT EXISTS idx_gea_ataskaita1_ear_number ON gea_daily_ataskaita1(ear_number);
CREATE INDEX IF NOT EXISTS idx_gea_ataskaita1_import_id ON gea_daily_ataskaita1(import_id);
CREATE INDEX IF NOT EXISTS idx_gea_ataskaita2_cow_number ON gea_daily_ataskaita2(cow_number);
CREATE INDEX IF NOT EXISTS idx_gea_ataskaita2_import_id ON gea_daily_ataskaita2(import_id);
CREATE INDEX IF NOT EXISTS idx_gea_ataskaita3_cow_number ON gea_daily_ataskaita3(cow_number);
CREATE INDEX IF NOT EXISTS idx_gea_ataskaita3_import_id ON gea_daily_ataskaita3(import_id);
CREATE INDEX IF NOT EXISTS idx_gea_imports_created_at ON gea_daily_imports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_treatments_animal_id ON treatments(animal_id);
CREATE INDEX IF NOT EXISTS idx_treatments_reg_date ON treatments(reg_date);
CREATE INDEX IF NOT EXISTS idx_treatments_withdrawal_milk ON treatments(withdrawal_until_milk) WHERE withdrawal_until_milk IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_animal_synchronizations_animal ON animal_synchronizations(animal_id);
CREATE INDEX IF NOT EXISTS idx_animal_synchronizations_start ON animal_synchronizations(start_date);
CREATE INDEX IF NOT EXISTS idx_synchronization_steps_sync ON synchronization_steps(synchronization_id);
CREATE INDEX IF NOT EXISTS idx_animals_tag_no ON animals(tag_no);
CREATE INDEX IF NOT EXISTS idx_animals_active ON animals(active) WHERE active = true;

-- Step 2: Fix RLS policies
DROP POLICY IF EXISTS "Allow anon to read settings" ON system_settings;
CREATE POLICY "Allow anon to read settings" ON system_settings FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Allow service_role to read settings" ON system_settings;
CREATE POLICY "Allow service_role to read settings" ON system_settings FOR SELECT TO service_role USING (true);

-- Step 3: Use the ORIGINAL view definitions from 20260208000001_fix_profitability_and_gea.sql
-- These were working but just needed indexes

DROP VIEW IF EXISTS treatment_milk_loss_summary CASCADE;

CREATE OR REPLACE VIEW treatment_milk_loss_summary AS
WITH latest_gea_milk AS (
  SELECT DISTINCT ON (a.id)
    a.id as animal_id,
    a.tag_no,
    COALESCE(gea.avg_milk_prod_weight, 0) as avg_milk
  FROM animals a
  LEFT JOIN gea_daily_cows_joined gea ON gea.ear_number = a.tag_no
    AND gea.avg_milk_prod_weight IS NOT NULL
    AND gea.avg_milk_prod_weight > 0
  ORDER BY a.id, gea.import_created_at DESC NULLS LAST
),
milk_price_setting AS (
  SELECT COALESCE(setting_value::numeric, 0.45) as price
  FROM system_settings 
  WHERE setting_key = 'milk_price_per_liter' 
  LIMIT 1
)
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
  mp.price as milk_price_eur_per_kg,
  (COALESCE(lgm.avg_milk, 0) * ((t.withdrawal_until_milk - t.reg_date) + 1)) * mp.price as total_value_lost_eur,
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
LEFT JOIN latest_gea_milk lgm ON lgm.animal_id = t.animal_id
CROSS JOIN milk_price_setting mp
WHERE t.withdrawal_until_milk IS NOT NULL
  AND (t.withdrawal_until_milk - t.reg_date) + 1 > 0
ORDER BY t.reg_date DESC;

-- Step 4: Recreate vw_animal_profitability using the approach from 20260208000001
DROP VIEW IF EXISTS vw_animal_profitability CASCADE;

CREATE OR REPLACE VIEW vw_animal_profitability AS
WITH latest_gea_per_animal AS (
  SELECT DISTINCT ON (a.id)
    a.id as animal_id,
    a.tag_no,
    gea.cow_number as collar_no,
    COALESCE(gea.lactation_days, 0) as lactation_days,
    COALESCE(gea.avg_milk_prod_weight, 0) as avg_daily_milk,
    gea.produce_milk as is_producing,
    gea.group_number as current_group,
    gea.cow_state as current_status,
    GREATEST(1, COALESCE(gea.lactation_days, 30)) as days_tracked,
    COALESCE(gea.avg_milk_prod_weight, 0) * GREATEST(1, COALESCE(gea.lactation_days, 30)) as total_milk_liters
  FROM animals a
  LEFT JOIN gea_daily_cows_joined gea ON gea.ear_number = a.tag_no
  WHERE a.active = true
  ORDER BY a.id, gea.import_created_at DESC NULLS LAST
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
        THEN (t.withdrawal_until_milk - t.reg_date) * COALESCE(lgea.avg_daily_milk, 0) * (SELECT COALESCE(setting_value::numeric, 0.45) FROM system_settings WHERE setting_key = 'milk_price_per_liter' LIMIT 1)
        ELSE 0
      END
    ), 0) as withdrawal_revenue_loss
  FROM treatments t
  LEFT JOIN latest_gea_per_animal lgea ON t.animal_id = lgea.animal_id
  GROUP BY t.animal_id
)
SELECT
  lgea.animal_id,
  lgea.tag_no,
  lgea.collar_no,
  lgea.days_tracked,
  lgea.total_milk_liters,
  lgea.avg_daily_milk,
  (lgea.total_milk_liters * (SELECT COALESCE(setting_value::numeric, 0.45) FROM system_settings WHERE setting_key = 'milk_price_per_liter' LIMIT 1)) as milk_revenue,
  COALESCE(aw.withdrawal_revenue_loss, 0) as withdrawal_revenue_loss,
  (lgea.total_milk_liters * (SELECT COALESCE(setting_value::numeric, 0.45) FROM system_settings WHERE setting_key = 'milk_price_per_liter' LIMIT 1)) - COALESCE(aw.withdrawal_revenue_loss, 0) as adjusted_milk_revenue,
  COALESCE(atc.treatment_count, 0) as treatment_count,
  COALESCE(avc.vaccination_count, 0) as vaccination_count,
  COALESCE(avic.visit_count, 0) as visit_count,
  COALESCE(atc.medication_costs, 0) + COALESCE(avc.vaccination_costs, 0) as medication_costs,
  COALESCE(avic.visit_costs, 0) as visit_costs,
  COALESCE(atc.medication_costs, 0) + COALESCE(avc.vaccination_costs, 0) + COALESCE(avic.visit_costs, 0) as total_costs,
  ((lgea.total_milk_liters * (SELECT COALESCE(setting_value::numeric, 0.45) FROM system_settings WHERE setting_key = 'milk_price_per_liter' LIMIT 1)) - COALESCE(aw.withdrawal_revenue_loss, 0)) - (COALESCE(atc.medication_costs, 0) + COALESCE(avc.vaccination_costs, 0) + COALESCE(avic.visit_costs, 0)) as net_profit,
  CASE 
    WHEN (COALESCE(atc.medication_costs, 0) + COALESCE(avc.vaccination_costs, 0) + COALESCE(avic.visit_costs, 0)) > 0
    THEN (((lgea.total_milk_liters * (SELECT COALESCE(setting_value::numeric, 0.45) FROM system_settings WHERE setting_key = 'milk_price_per_liter' LIMIT 1)) - COALESCE(aw.withdrawal_revenue_loss, 0)) - (COALESCE(atc.medication_costs, 0) + COALESCE(avc.vaccination_costs, 0) + COALESCE(avic.visit_costs, 0))) / NULLIF((COALESCE(atc.medication_costs, 0) + COALESCE(avc.vaccination_costs, 0) + COALESCE(avic.visit_costs, 0)), 0) * 100
    ELSE NULL
  END as roi_percentage,
  CASE 
    WHEN (lgea.total_milk_liters * (SELECT COALESCE(setting_value::numeric, 0.45) FROM system_settings WHERE setting_key = 'milk_price_per_liter' LIMIT 1)) > 0
    THEN (COALESCE(atc.medication_costs, 0) + COALESCE(avc.vaccination_costs, 0) + COALESCE(avic.visit_costs, 0)) / NULLIF((lgea.total_milk_liters * (SELECT COALESCE(setting_value::numeric, 0.45) FROM system_settings WHERE setting_key = 'milk_price_per_liter' LIMIT 1)), 0)
    ELSE NULL
  END as cost_to_revenue_ratio,
  lgea.lactation_days,
  lgea.current_group,
  lgea.current_status,
  lgea.is_producing,
  COALESCE(aw.days_in_withdrawal, 0) as days_in_withdrawal
FROM latest_gea_per_animal lgea
LEFT JOIN animal_treatment_costs atc ON lgea.animal_id = atc.animal_id
LEFT JOIN animal_vaccination_costs avc ON lgea.animal_id = avc.animal_id
LEFT JOIN animal_visit_costs avic ON lgea.animal_id = avic.animal_id
LEFT JOIN animal_withdrawal aw ON lgea.animal_id = aw.animal_id
WHERE lgea.lactation_days > 0 OR atc.treatment_count > 0;

-- Step 5: Recreate dependent views
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

-- Step 6: Recreate animal_milk_loss_by_synchronization with the ORIGINAL approach
DROP VIEW IF EXISTS animal_milk_loss_by_synchronization CASCADE;

CREATE OR REPLACE VIEW animal_milk_loss_by_synchronization AS
WITH latest_gea_milk AS (
  SELECT DISTINCT ON (a.id)
    a.id as animal_id,
    COALESCE(gea.avg_milk_prod_weight, 0) as avg_milk
  FROM animals a
  LEFT JOIN gea_daily_cows_joined gea ON gea.ear_number = a.tag_no
    AND gea.avg_milk_prod_weight IS NOT NULL
    AND gea.avg_milk_prod_weight > 0
  ORDER BY a.id, gea.import_created_at DESC NULLS LAST
),
sync_end_dates AS (
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
LEFT JOIN latest_gea_milk lgm ON lgm.animal_id = a.id
WHERE s.status = ANY (ARRAY['Active'::text, 'Completed'::text])
  AND (COALESCE(sed.max_date, s.start_date + INTERVAL '14 days')::date - s.start_date) + 1 > 0
ORDER BY s.start_date DESC, a.tag_no;

-- Grant permissions
GRANT SELECT ON treatment_milk_loss_summary TO anon, authenticated, service_role;
GRANT SELECT ON vw_animal_profitability TO anon, authenticated, service_role;
GRANT SELECT ON vw_herd_profitability_summary TO anon, authenticated, service_role;
GRANT SELECT ON vw_treatment_roi_analysis TO anon, authenticated, service_role;
GRANT SELECT ON animal_milk_loss_by_synchronization TO anon, authenticated, service_role;

-- Run ANALYZE to update statistics
ANALYZE gea_daily_ataskaita1;
ANALYZE gea_daily_ataskaita2;
ANALYZE gea_daily_ataskaita3;
ANALYZE gea_daily_imports;
ANALYZE treatments;
ANALYZE animals;
