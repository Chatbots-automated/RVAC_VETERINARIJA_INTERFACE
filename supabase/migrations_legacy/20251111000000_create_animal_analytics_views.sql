/*
  # Create Comprehensive Animal Analytics Views

  1. Enhanced Spend Analytics
    - Calculate total costs per animal including treatments, vaccinations, visits
    - Break down by category (medicines, vaccines, procedures)

  2. Teat-Level Treatment Analytics
    - Track which teats (LF, RF, LR, RR) have the most treatments
    - Count treatments per teat with outcomes

  3. Product Usage Analytics
    - Track most used medications per animal

  4. Visit Analytics
    - Count visits by type and status
    - Track completion rates

  5. Treatment Outcome Analytics
    - Track treatment success rates
*/

-- Enhanced animal cost analytics view with full breakdown
CREATE OR REPLACE VIEW public.vw_animal_cost_analytics AS
WITH treatment_costs AS (
  SELECT
    t.animal_id,
    COUNT(DISTINCT t.id) as treatment_count,
    COALESCE(SUM(ui.qty * COALESCE(b.purchase_price / NULLIF(b.received_qty, 0), 0)), 0) as medicine_cost
  FROM public.treatments t
  LEFT JOIN public.usage_items ui ON ui.treatment_id = t.id
  LEFT JOIN public.batches b ON b.id = ui.batch_id
  WHERE t.animal_id IS NOT NULL
  GROUP BY t.animal_id
),
vaccination_costs AS (
  SELECT
    v.animal_id,
    COUNT(v.id) as vaccination_count,
    0 as vaccine_cost
  FROM public.vaccinations v
  WHERE v.animal_id IS NOT NULL
  GROUP BY v.animal_id
),
visit_costs AS (
  SELECT
    av.animal_id,
    COUNT(av.id) as visit_count,
    COUNT(av.id) * 10 as visit_cost
  FROM public.animal_visits av
  WHERE av.animal_id IS NOT NULL
  GROUP BY av.animal_id
)
SELECT
  a.id as animal_id,
  a.tag_no,
  COALESCE(tc.treatment_count, 0) as treatment_count,
  COALESCE(tc.medicine_cost, 0) as medicine_cost,
  COALESCE(vc.vaccination_count, 0) as vaccination_count,
  COALESCE(vc.vaccine_cost, 0) as vaccine_cost,
  COALESCE(vsc.visit_count, 0) as visit_count,
  COALESCE(vsc.visit_cost, 0) as visit_cost,
  COALESCE(tc.medicine_cost, 0) + COALESCE(vc.vaccine_cost, 0) + COALESCE(vsc.visit_cost, 0) as total_cost
FROM public.animals a
LEFT JOIN treatment_costs tc ON tc.animal_id = a.id
LEFT JOIN vaccination_costs vc ON vc.animal_id = a.id
LEFT JOIN visit_costs vsc ON vsc.animal_id = a.id;

-- Teat-level treatment analytics
CREATE OR REPLACE VIEW public.vw_teat_treatment_analytics AS
SELECT
  t.animal_id,
  a.tag_no,
  t.mastitis_teat as teat,
  COUNT(*) as treatment_count,
  COUNT(CASE WHEN t.mastitis_type = 'new' THEN 1 END) as new_case_count,
  COUNT(CASE WHEN t.mastitis_type = 'recurring' THEN 1 END) as recurring_case_count,
  COUNT(CASE WHEN t.outcome = 'recovered' THEN 1 END) as recovered_count,
  COUNT(CASE WHEN t.outcome = 'ongoing' THEN 1 END) as ongoing_count,
  MIN(t.reg_date) as first_treatment_date,
  MAX(t.reg_date) as last_treatment_date
FROM public.treatments t
JOIN public.animals a ON a.id = t.animal_id
WHERE t.mastitis_teat IS NOT NULL
GROUP BY t.animal_id, a.tag_no, t.mastitis_teat;

-- Product usage per animal (most used medications/vaccines)
CREATE OR REPLACE VIEW public.vw_animal_product_usage AS
WITH treatment_products AS (
  SELECT
    t.animal_id,
    p.id as product_id,
    p.name as product_name,
    p.category,
    COUNT(ui.id) as usage_count,
    SUM(ui.qty) as total_quantity,
    SUM(ui.qty * COALESCE(b.purchase_price / NULLIF(b.received_qty, 0), 0)) as total_cost
  FROM public.treatments t
  JOIN public.usage_items ui ON ui.treatment_id = t.id
  JOIN public.products p ON p.id = ui.product_id
  LEFT JOIN public.batches b ON b.id = ui.batch_id
  WHERE t.animal_id IS NOT NULL
  GROUP BY t.animal_id, p.id, p.name, p.category
)
SELECT
  animal_id,
  product_id,
  product_name,
  category,
  usage_count,
  total_quantity,
  total_cost,
  ROW_NUMBER() OVER (PARTITION BY animal_id ORDER BY usage_count DESC) as usage_rank
FROM treatment_products;

-- Visit completion analytics
CREATE OR REPLACE VIEW public.vw_animal_visit_analytics AS
SELECT
  av.animal_id,
  a.tag_no,
  COUNT(*) as total_visits,
  COUNT(CASE WHEN av.status = 'Užbaigtas' THEN 1 END) as completed_visits,
  COUNT(CASE WHEN av.status = 'Planuojamas' THEN 1 END) as planned_visits,
  COUNT(CASE WHEN av.status = 'Atšauktas' THEN 1 END) as cancelled_visits,
  COUNT(CASE WHEN av.temperature IS NOT NULL THEN 1 END) as temperature_checks,
  ROUND(AVG(av.temperature)::numeric, 1) as avg_temperature,
  MAX(av.temperature) as max_temperature,
  COUNT(CASE WHEN av.treatment_required THEN 1 END) as treatments_required_count,
  MIN(av.visit_datetime) as first_visit,
  MAX(av.visit_datetime) as last_visit
FROM public.animal_visits av
JOIN public.animals a ON a.id = av.animal_id
GROUP BY av.animal_id, a.tag_no;

-- Treatment outcome analytics
CREATE OR REPLACE VIEW public.vw_animal_treatment_outcomes AS
SELECT
  t.animal_id,
  a.tag_no,
  COUNT(*) as total_treatments,
  COUNT(CASE WHEN t.outcome = 'recovered' THEN 1 END) as recovered_count,
  COUNT(CASE WHEN t.outcome = 'ongoing' THEN 1 END) as ongoing_count,
  COUNT(CASE WHEN t.outcome = 'deceased' THEN 1 END) as deceased_count,
  COUNT(CASE WHEN t.outcome IS NULL THEN 1 END) as unknown_outcome_count,
  ROUND(
    COUNT(CASE WHEN t.outcome = 'recovered' THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100,
    1
  ) as recovery_rate_percent
FROM public.treatments t
JOIN public.animals a ON a.id = t.animal_id
GROUP BY t.animal_id, a.tag_no;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_treatments_animal_teat ON public.treatments(animal_id, mastitis_teat) WHERE mastitis_teat IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_treatments_animal_outcome ON public.treatments(animal_id, outcome);
CREATE INDEX IF NOT EXISTS idx_animal_visits_animal_status ON public.animal_visits(animal_id, status);
CREATE INDEX IF NOT EXISTS idx_usage_items_product ON public.usage_items(product_id);
