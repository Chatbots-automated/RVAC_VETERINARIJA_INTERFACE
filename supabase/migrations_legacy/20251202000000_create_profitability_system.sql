/*
  # Profitability & Treatment ROI Decision Support System

  1. New Tables
    - `system_settings`
      - Stores configurable business parameters like milk price, cow sale value
      - Allows owner to adjust key financial assumptions

  2. New Views
    - `vw_animal_milk_revenue`
      - Calculates milk production and revenue per animal from gea_daily
      - Includes withdrawal period adjustments

    - `vw_animal_profitability`
      - Comprehensive profitability calculation joining revenue and costs
      - Shows net profit, margins, and ROI per animal

    - `vw_treatment_roi_analysis`
      - Analyzes treatment effectiveness and payback periods
      - Helps with treat vs cull decisions

    - `vw_herd_profitability_summary`
      - Aggregate herd-wide financial metrics
      - Top/bottom performers identification

  3. Security
    - Enable RLS on system_settings table
    - Grant read access to views for authenticated users

  4. Important Notes
    - Default milk price set to 0.50 EUR/liter (adjustable)
    - Default cow sale price set to 800 EUR (adjustable)
    - Profitability calculated over last 90 days by default
    - Views update in real-time as data changes
*/

-- Create system_settings table for configurable business parameters
CREATE TABLE IF NOT EXISTS system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text UNIQUE NOT NULL,
  setting_value text NOT NULL,
  setting_type text NOT NULL CHECK (setting_type IN ('number', 'text', 'boolean')),
  description text,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid
);

-- Insert default settings
INSERT INTO system_settings (setting_key, setting_value, setting_type, description)
VALUES
  ('milk_price_per_liter', '0.50', 'number', 'Price received per liter of milk in EUR'),
  ('avg_cow_sale_price', '800', 'number', 'Average price when selling a cow in EUR'),
  ('profitability_period_days', '90', 'number', 'Number of days to calculate profitability over'),
  ('treatment_decision_threshold', '30', 'number', 'Days to payback treatment cost (decision threshold)'),
  ('withdrawal_daily_loss', '15', 'number', 'Estimated daily loss during withdrawal period in EUR')
ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value;

-- Enable RLS
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- Policies for system_settings
CREATE POLICY "Authenticated users can view settings"
  ON system_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update settings"
  ON system_settings FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create helper function to get setting value
CREATE OR REPLACE FUNCTION get_setting(key text, default_value numeric DEFAULT 0)
RETURNS numeric AS $$
  SELECT COALESCE(
    (SELECT setting_value::numeric FROM system_settings WHERE setting_key = key),
    default_value
  );
$$ LANGUAGE sql STABLE;

-- View: Animal Milk Revenue Calculation
CREATE OR REPLACE VIEW vw_animal_milk_revenue AS
WITH milk_production AS (
  SELECT
    gd.animal_id,
    a.tag_no,
    MAX(gd.collar_no) as collar_no,
    COUNT(*) as days_tracked,
    SUM(
      COALESCE(gd.m1_qty, 0) +
      COALESCE(gd.m2_qty, 0) +
      COALESCE(gd.m3_qty, 0) +
      COALESCE(gd.m4_qty, 0) +
      COALESCE(gd.m5_qty, 0)
    ) as total_milk_liters,
    AVG(
      COALESCE(gd.m1_qty, 0) +
      COALESCE(gd.m2_qty, 0) +
      COALESCE(gd.m3_qty, 0) +
      COALESCE(gd.m4_qty, 0) +
      COALESCE(gd.m5_qty, 0)
    ) as avg_daily_milk,
    MIN(gd.snapshot_date) as first_date,
    MAX(gd.snapshot_date) as last_date,
    MAX(gd.lact_days) as lactation_days,
    MAX(gd.grupe) as current_group,
    MAX(gd.statusas) as current_status,
    BOOL_OR(gd.in_milk) as is_producing
  FROM gea_daily gd
  JOIN animals a ON a.id = gd.animal_id
  WHERE gd.snapshot_date >= CURRENT_DATE - INTERVAL '90 days'
  GROUP BY gd.animal_id, a.tag_no
),
withdrawal_days AS (
  SELECT
    animal_id,
    COUNT(DISTINCT DATE(created_at)) as days_in_withdrawal
  FROM treatments
  WHERE withdrawal_until_milk IS NOT NULL
    AND withdrawal_until_milk >= CURRENT_DATE - INTERVAL '90 days'
    AND created_at >= CURRENT_DATE - INTERVAL '90 days'
  GROUP BY animal_id
)
SELECT
  mp.animal_id,
  mp.tag_no,
  mp.collar_no,
  mp.days_tracked,
  mp.total_milk_liters,
  mp.avg_daily_milk,
  mp.total_milk_liters * get_setting('milk_price_per_liter', 0.50) as milk_revenue,
  mp.first_date,
  mp.last_date,
  mp.lactation_days,
  mp.current_group,
  mp.current_status,
  mp.is_producing,
  COALESCE(wd.days_in_withdrawal, 0) as days_in_withdrawal,
  COALESCE(wd.days_in_withdrawal, 0) * get_setting('withdrawal_daily_loss', 15) as withdrawal_revenue_loss
FROM milk_production mp
LEFT JOIN withdrawal_days wd ON wd.animal_id = mp.animal_id;

-- View: Comprehensive Animal Profitability
CREATE OR REPLACE VIEW vw_animal_profitability AS
WITH animal_costs AS (
  SELECT
    a.id as animal_id,
    a.tag_no,
    COALESCE(COUNT(DISTINCT t.id), 0) as treatment_count,
    COALESCE(COUNT(DISTINCT v.id), 0) as vaccination_count,
    COALESCE(COUNT(DISTINCT av.id), 0) as visit_count,
    COALESCE(SUM(ui.qty * b.purchase_price / NULLIF(b.received_qty, 0)), 0) as medication_costs,
    COALESCE(COUNT(DISTINCT av.id) * 10, 0) as visit_costs,
    COALESCE(SUM(ui.qty * b.purchase_price / NULLIF(b.received_qty, 0)), 0) +
    COALESCE(COUNT(DISTINCT av.id) * 10, 0) as total_costs
  FROM animals a
  LEFT JOIN treatments t ON t.animal_id = a.id
    AND t.reg_date >= CURRENT_DATE - INTERVAL '90 days'
  LEFT JOIN vaccinations v ON v.animal_id = a.id
    AND v.vaccination_date >= CURRENT_DATE - INTERVAL '90 days'
  LEFT JOIN animal_visits av ON av.animal_id = a.id
    AND av.visit_datetime >= CURRENT_DATE - INTERVAL '90 days'
  LEFT JOIN usage_items ui ON ui.treatment_id = t.id
  LEFT JOIN batches b ON b.id = ui.batch_id
  GROUP BY a.id, a.tag_no
)
SELECT
  COALESCE(ac.animal_id, mr.animal_id) as animal_id,
  COALESCE(ac.tag_no, mr.tag_no) as tag_no,
  mr.collar_no,
  mr.days_tracked,
  mr.total_milk_liters,
  mr.avg_daily_milk,
  mr.milk_revenue,
  mr.withdrawal_revenue_loss,
  mr.milk_revenue - mr.withdrawal_revenue_loss as adjusted_milk_revenue,
  COALESCE(ac.treatment_count, 0) as treatment_count,
  COALESCE(ac.vaccination_count, 0) as vaccination_count,
  COALESCE(ac.visit_count, 0) as visit_count,
  COALESCE(ac.medication_costs, 0) as medication_costs,
  COALESCE(ac.visit_costs, 0) as visit_costs,
  COALESCE(ac.total_costs, 0) as total_costs,
  (mr.milk_revenue - mr.withdrawal_revenue_loss) - COALESCE(ac.total_costs, 0) as net_profit,
  CASE
    WHEN COALESCE(ac.total_costs, 0) > 0 THEN
      ROUND(((mr.milk_revenue - mr.withdrawal_revenue_loss) - COALESCE(ac.total_costs, 0)) / COALESCE(ac.total_costs, 0) * 100, 1)
    ELSE NULL
  END as roi_percentage,
  CASE
    WHEN (mr.milk_revenue - mr.withdrawal_revenue_loss) > 0 THEN
      ROUND(COALESCE(ac.total_costs, 0) / (mr.milk_revenue - mr.withdrawal_revenue_loss) * 100, 1)
    ELSE NULL
  END as cost_to_revenue_ratio,
  mr.lactation_days,
  mr.current_group,
  mr.current_status,
  mr.is_producing,
  mr.days_in_withdrawal,
  mr.first_date,
  mr.last_date
FROM vw_animal_milk_revenue mr
FULL OUTER JOIN animal_costs ac ON ac.animal_id = mr.animal_id;

-- View: Treatment ROI Analysis for Decision Support
CREATE OR REPLACE VIEW vw_treatment_roi_analysis AS
WITH recent_treatments AS (
  SELECT
    t.animal_id,
    a.tag_no,
    COUNT(*) as treatment_count_last_90_days,
    SUM(ui.qty * b.purchase_price / NULLIF(b.received_qty, 0)) as total_treatment_cost,
    AVG(ui.qty * b.purchase_price / NULLIF(b.received_qty, 0)) as avg_treatment_cost,
    MAX(t.reg_date) as last_treatment_date,
    COUNT(CASE WHEN t.outcome = 'recovered' THEN 1 END) as successful_treatments,
    COUNT(CASE WHEN t.outcome = 'ongoing' THEN 1 END) as ongoing_treatments
  FROM treatments t
  JOIN animals a ON a.id = t.animal_id
  LEFT JOIN usage_items ui ON ui.treatment_id = t.id
  LEFT JOIN batches b ON b.id = ui.batch_id
  WHERE t.reg_date >= CURRENT_DATE - INTERVAL '90 days'
  GROUP BY t.animal_id, a.tag_no
)
SELECT
  p.animal_id,
  p.tag_no,
  p.collar_no,
  p.avg_daily_milk,
  p.net_profit,
  p.total_costs as current_total_costs,
  rt.treatment_count_last_90_days,
  rt.total_treatment_cost,
  rt.avg_treatment_cost,
  rt.last_treatment_date,
  rt.successful_treatments,
  rt.ongoing_treatments,
  CASE
    WHEN rt.treatment_count_last_90_days > 0 THEN
      ROUND((rt.successful_treatments::numeric / rt.treatment_count_last_90_days * 100), 1)
    ELSE NULL
  END as success_rate_percentage,
  CASE
    WHEN p.avg_daily_milk > 0 AND rt.avg_treatment_cost > 0 THEN
      ROUND(rt.avg_treatment_cost / (p.avg_daily_milk * get_setting('milk_price_per_liter', 0.50)), 0)
    ELSE NULL
  END as days_to_payback_avg_treatment,
  CASE
    WHEN p.net_profit < -100 THEN 'cull_recommended'
    WHEN p.net_profit < 0 THEN 'at_risk'
    WHEN rt.treatment_count_last_90_days >= 3 THEN 'chronic_case'
    WHEN p.net_profit > 50 THEN 'profitable'
    ELSE 'monitor'
  END as recommendation,
  p.current_status,
  p.is_producing
FROM vw_animal_profitability p
LEFT JOIN recent_treatments rt ON rt.animal_id = p.animal_id;

-- View: Herd-Wide Profitability Summary
CREATE OR REPLACE VIEW vw_herd_profitability_summary AS
SELECT
  COUNT(*) as total_animals,
  COUNT(CASE WHEN net_profit > 0 THEN 1 END) as profitable_count,
  COUNT(CASE WHEN net_profit <= 0 THEN 1 END) as unprofitable_count,
  COUNT(CASE WHEN net_profit < -50 THEN 1 END) as severe_loss_count,
  SUM(total_milk_liters) as total_herd_milk,
  SUM(milk_revenue) as total_milk_revenue,
  SUM(total_costs) as total_treatment_costs,
  SUM(net_profit) as total_herd_profit,
  ROUND(AVG(net_profit), 2) as avg_profit_per_animal,
  ROUND(AVG(avg_daily_milk), 2) as avg_daily_milk_per_animal,
  SUM(days_in_withdrawal) as total_withdrawal_days,
  SUM(withdrawal_revenue_loss) as total_withdrawal_loss,
  ROUND(
    CASE
      WHEN SUM(milk_revenue) > 0 THEN
        SUM(total_costs) / SUM(milk_revenue) * 100
      ELSE 0
    END, 1
  ) as overall_cost_to_revenue_ratio
FROM vw_animal_profitability
WHERE days_tracked > 0;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_gea_daily_animal_snapshot ON gea_daily(animal_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_gea_daily_recent ON gea_daily(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_treatments_animal_recent ON treatments(animal_id, reg_date);
CREATE INDEX IF NOT EXISTS idx_vaccinations_animal_recent ON vaccinations(animal_id, vaccination_date);

-- Grant access to views
GRANT SELECT ON vw_animal_milk_revenue TO authenticated;
GRANT SELECT ON vw_animal_profitability TO authenticated;
GRANT SELECT ON vw_treatment_roi_analysis TO authenticated;
GRANT SELECT ON vw_herd_profitability_summary TO authenticated;

-- Add helpful comments
COMMENT ON VIEW vw_animal_milk_revenue IS 'Calculates milk production and revenue per animal from GEA data';
COMMENT ON VIEW vw_animal_profitability IS 'Comprehensive profitability analysis combining revenue and treatment costs';
COMMENT ON VIEW vw_treatment_roi_analysis IS 'Treatment ROI analysis for treatment vs cull decision support';
COMMENT ON VIEW vw_herd_profitability_summary IS 'Aggregate herd-wide profitability metrics and KPIs';
COMMENT ON FUNCTION get_setting(text, numeric) IS 'Helper function to retrieve system setting values with defaults';
