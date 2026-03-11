/*
  # Add Units to Analytics Views

  1. Changes
    - Update `vw_animal_product_usage` to include `primary_pack_unit` from products
    - This allows analytics to display correct measurement units (ml, svirkstukas, bolusas, etc.)

  2. Notes
    - Units will now be displayed alongside quantities in analytics
*/

-- Update product usage view to include units
DROP VIEW IF EXISTS public.vw_animal_product_usage;

CREATE OR REPLACE VIEW public.vw_animal_product_usage AS
WITH treatment_products AS (
  SELECT
    t.animal_id,
    p.id as product_id,
    p.name as product_name,
    p.category,
    p.primary_pack_unit as unit,
    COUNT(ui.id) as usage_count,
    SUM(ui.qty) as total_quantity,
    SUM(ui.qty * COALESCE(b.purchase_price / NULLIF(b.received_qty, 0), 0)) as total_cost
  FROM public.treatments t
  JOIN public.usage_items ui ON ui.treatment_id = t.id
  JOIN public.products p ON p.id = ui.product_id
  LEFT JOIN public.batches b ON b.id = ui.batch_id
  WHERE t.animal_id IS NOT NULL
  GROUP BY t.animal_id, p.id, p.name, p.category, p.primary_pack_unit
)
SELECT
  animal_id,
  product_id,
  product_name,
  category,
  unit,
  usage_count,
  total_quantity,
  total_cost,
  ROW_NUMBER() OVER (PARTITION BY animal_id ORDER BY usage_count DESC) as usage_rank
FROM treatment_products;
