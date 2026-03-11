-- Aggressive optimization: Query underlying tables directly instead of gea_daily_cows_joined view
-- This bypasses the expensive view and goes straight to the base tables

-- Recreate treatment_milk_loss_summary with direct table access
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
  -- Query underlying tables directly instead of gea_daily_cows_joined view
  SELECT COALESCE(a2.avg_milk_prod_weight, 0) as avg_milk
  FROM gea_daily_ataskaita1 a1
  JOIN gea_daily_imports i ON i.id = a1.import_id
  JOIN gea_daily_ataskaita2 a2 ON a2.import_id = a1.import_id AND a2.cow_number = a1.cow_number
  WHERE a1.ear_number = a.tag_no
    AND a2.avg_milk_prod_weight IS NOT NULL
    AND a2.avg_milk_prod_weight > 0
  ORDER BY i.created_at DESC
  LIMIT 1
) lgm ON true
WHERE t.withdrawal_until_milk IS NOT NULL
  AND (t.withdrawal_until_milk - t.reg_date) + 1 > 0
ORDER BY t.reg_date DESC;

COMMENT ON VIEW treatment_milk_loss_summary IS 'Treatment milk loss analysis querying base tables directly for maximum performance';

-- Recreate vw_animal_profitability with direct table access
DROP VIEW IF EXISTS vw_animal_profitability CASCADE;

CREATE OR REPLACE VIEW vw_animal_profitability AS
WITH animal_gea_data AS (
  -- Query base tables directly for each animal
  SELECT 
    a.id as animal_id,
    a.tag_no,
    (SELECT a1.cow_number 
     FROM gea_daily_ataskaita1 a1
     JOIN gea_daily_imports i ON i.id = a1.import_id
     WHERE a1.ear_number = a.tag_no
     ORDER BY i.created_at DESC 
     LIMIT 1) as collar_no,
    COALESCE((SELECT a1.lactation_days 
     FROM gea_daily_ataskaita1 a1
     JOIN gea_daily_imports i ON i.id = a1.import_id
     WHERE a1.ear_number = a.tag_no
     ORDER BY i.created_at DESC 
     LIMIT 1), 0) as lactation_days,
    COALESCE((SELECT a2.avg_milk_prod_weight 
     FROM gea_daily_ataskaita2 a2
     JOIN gea_daily_imports i ON i.id = a2.import_id
     JOIN gea_daily_ataskaita1 a1 ON a1.import_id = a2.import_id AND a1.cow_number = a2.cow_number
     WHERE a1.ear_number = a.tag_no
       AND a2.avg_milk_prod_weight IS NOT NULL 
       AND a2.avg_milk_prod_weight > 0
     ORDER BY i.created_at DESC 
     LIMIT 1), 0) as avg_daily_milk,
    (SELECT a2.produce_milk 
     FROM gea_daily_ataskaita2 a2
     JOIN gea_daily_imports i ON i.id = a2.import_id
     JOIN gea_daily_ataskaita1 a1 ON a1.import_id = a2.import_id AND a1.cow_number = a2.cow_number
     WHERE a1.ear_number = a.tag_no
     ORDER BY i.created_at DESC 
     LIMIT 1) as is_producing,
    (SELECT a1.group_number 
     FROM gea_daily_ataskaita1 a1
     JOIN gea_daily_imports i ON i.id = a1.import_id
     WHERE a1.ear_number = a.tag_no
     ORDER BY i.created_at DESC 
     LIMIT 1) as current_group,
    (SELECT a1.cow_state 
     FROM gea_daily_ataskaita1 a1
     JOIN gea_daily_imports i ON i.id = a1.import_id
     WHERE a1.ear_number = a.tag_no
     ORDER BY i.created_at DESC 
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

COMMENT ON VIEW vw_animal_profitability IS 'Profitability analysis querying base tables directly for maximum performance';

-- Recreate animal_milk_loss_by_synchronization with direct table access
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
  -- Query base tables directly
  SELECT COALESCE(a2.avg_milk_prod_weight, 0) as avg_milk
  FROM gea_daily_ataskaita1 a1
  JOIN gea_daily_imports i ON i.id = a1.import_id
  JOIN gea_daily_ataskaita2 a2 ON a2.import_id = a1.import_id AND a2.cow_number = a1.cow_number
  WHERE a1.ear_number = a.tag_no
    AND i.created_at < s.start_date
    AND a2.avg_milk_prod_weight IS NOT NULL
    AND a2.avg_milk_prod_weight > 0
  ORDER BY i.created_at DESC
  LIMIT 1
) lgm ON true
WHERE s.status = ANY (ARRAY['Active'::text, 'Completed'::text])
  AND (COALESCE(sed.max_date, s.start_date + INTERVAL '14 days')::date - s.start_date) + 1 > 0
ORDER BY s.start_date DESC, a.tag_no;

COMMENT ON VIEW animal_milk_loss_by_synchronization IS 'Synchronization milk loss analysis querying base tables directly for maximum performance';

-- Grant permissions
GRANT SELECT ON treatment_milk_loss_summary TO anon, authenticated, service_role;
GRANT SELECT ON vw_animal_profitability TO anon, authenticated, service_role;
GRANT SELECT ON animal_milk_loss_by_synchronization TO anon, authenticated, service_role;
