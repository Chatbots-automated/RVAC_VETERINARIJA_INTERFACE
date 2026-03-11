-- Fix missing system_settings entry for milk price
INSERT INTO system_settings (setting_key, setting_value, setting_type, description)
VALUES ('milk_price_per_liter', '0.45', 'number', 'Pieno kaina už litrą (EUR)')
ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value;

-- Update calculate_average_daily_milk function to use new GEA structure
CREATE OR REPLACE FUNCTION public.calculate_average_daily_milk(p_animal_id uuid, p_before_date date DEFAULT CURRENT_DATE)
RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_avg_milk numeric;
  v_tag_no text;
BEGIN
  -- Get animal's tag number
  SELECT tag_no INTO v_tag_no FROM animals WHERE id = p_animal_id;
  
  IF v_tag_no IS NULL THEN
    RETURN 0;
  END IF;

  -- First try to get avg_milk_prod_weight from before the specified date
  SELECT COALESCE(avg_milk_prod_weight, 0)
  INTO v_avg_milk
  FROM gea_daily_cows_joined
  WHERE ear_number = v_tag_no
    AND DATE(import_created_at) < p_before_date
    AND avg_milk_prod_weight IS NOT NULL
    AND avg_milk_prod_weight > 0
  ORDER BY import_created_at DESC
  LIMIT 1;

  -- If no data found before the date, get the most recent available data
  IF v_avg_milk IS NULL OR v_avg_milk = 0 THEN
    SELECT COALESCE(avg_milk_prod_weight, 0)
    INTO v_avg_milk
    FROM gea_daily_cows_joined
    WHERE ear_number = v_tag_no
      AND avg_milk_prod_weight IS NOT NULL
      AND avg_milk_prod_weight > 0
    ORDER BY import_created_at DESC
    LIMIT 1;
  END IF;

  RETURN COALESCE(v_avg_milk, 0);
END;
$$;

-- Update get_animal_avg_milk_at_date function to use new GEA structure
CREATE OR REPLACE FUNCTION public.get_animal_avg_milk_at_date(p_animal_id uuid, p_date date)
RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_avg_milk numeric;
  v_tag_no text;
BEGIN
  -- Get animal's tag number
  SELECT tag_no INTO v_tag_no FROM animals WHERE id = p_animal_id;
  
  IF v_tag_no IS NULL THEN
    RETURN 0;
  END IF;

  -- First try to get avg_milk_prod_weight at or before the specified date
  SELECT COALESCE(avg_milk_prod_weight, 0)
  INTO v_avg_milk
  FROM gea_daily_cows_joined
  WHERE ear_number = v_tag_no
    AND DATE(import_created_at) <= p_date
    AND avg_milk_prod_weight IS NOT NULL
    AND avg_milk_prod_weight > 0
  ORDER BY import_created_at DESC
  LIMIT 1;

  -- If no data found at or before the date, get the most recent available data
  IF v_avg_milk IS NULL OR v_avg_milk = 0 THEN
    SELECT COALESCE(avg_milk_prod_weight, 0)
    INTO v_avg_milk
    FROM gea_daily_cows_joined
    WHERE ear_number = v_tag_no
      AND avg_milk_prod_weight IS NOT NULL
      AND avg_milk_prod_weight > 0
    ORDER BY import_created_at DESC
    LIMIT 1;
  END IF;

  RETURN COALESCE(v_avg_milk, 0);
END;
$$;

-- Create vw_animal_profitability view
-- This view calculates profitability metrics for each animal
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

COMMENT ON VIEW vw_animal_profitability IS 'Profitability analysis per animal including milk revenue, treatment costs, and ROI';

-- Optimize treatment_milk_loss_summary view to avoid timeout
-- Pre-compute latest GEA data per animal to avoid nested subqueries
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

COMMENT ON VIEW treatment_milk_loss_summary IS 'Treatment milk loss analysis with pre-computed GEA data for better performance';
