/*
  # Add Withdrawal Status and Spend Analytics Views

  1. Withdrawal Status View
    - Shows current withdrawal status per animal
    - Calculates milk and meat withdrawal end dates
    - Used for warning display in treatment forms
  
  2. Spend Per Animal View
    - Calculates total spend per animal
    - Counts number of treatments
    - Used for analytics dashboard
  
  3. Update Treatments Table
    - Add computed withdrawal dates (milk/meat)
    - These are calculated on save based on products used
*/

-- Add withdrawal date fields to treatments
ALTER TABLE public.treatments
  ADD COLUMN IF NOT EXISTS withdrawal_until_milk date,
  ADD COLUMN IF NOT EXISTS withdrawal_until_meat date;

-- Create withdrawal status view
CREATE OR REPLACE VIEW public.vw_withdrawal_status AS
SELECT 
  t.animal_id,
  a.tag_no,
  MAX(t.withdrawal_until_milk) as milk_until,
  MAX(t.withdrawal_until_meat) as meat_until,
  CASE 
    WHEN MAX(t.withdrawal_until_milk) >= CURRENT_DATE THEN true
    ELSE false
  END as milk_active,
  CASE 
    WHEN MAX(t.withdrawal_until_meat) >= CURRENT_DATE THEN true
    ELSE false
  END as meat_active
FROM public.treatments t
LEFT JOIN public.animals a ON a.id = t.animal_id
WHERE t.animal_id IS NOT NULL
GROUP BY t.animal_id, a.tag_no;

-- Create spend per animal view
CREATE OR REPLACE VIEW public.vw_spend_per_animal AS
SELECT 
  a.id as animal_id,
  a.tag_no,
  COUNT(DISTINCT t.id) as treatment_count,
  COALESCE(SUM(
    ui.qty * COALESCE(b.purchase_price / NULLIF(b.received_qty, 0), 0)
  ), 0) as total_spend
FROM public.animals a
LEFT JOIN public.treatments t ON t.animal_id = a.id
LEFT JOIN public.usage_items ui ON ui.treatment_id = t.id
LEFT JOIN public.batches b ON b.id = ui.batch_id
GROUP BY a.id, a.tag_no;

-- Function to calculate withdrawal dates for a treatment
CREATE OR REPLACE FUNCTION public.calculate_withdrawal_dates(p_treatment_id uuid)
RETURNS void AS $$
DECLARE
  v_reg_date date;
  v_milk_until date;
  v_meat_until date;
BEGIN
  -- Get the treatment registration date
  SELECT reg_date INTO v_reg_date
  FROM public.treatments
  WHERE id = p_treatment_id;
  
  -- Calculate milk withdrawal (max of all products used)
  SELECT MAX(v_reg_date + COALESCE(p.withdrawal_days_milk, 0))
  INTO v_milk_until
  FROM public.usage_items ui
  JOIN public.products p ON p.id = ui.product_id
  WHERE ui.treatment_id = p_treatment_id
    AND p.withdrawal_days_milk IS NOT NULL;
  
  -- Calculate meat withdrawal (max of all products used)
  SELECT MAX(v_reg_date + COALESCE(p.withdrawal_days_meat, 0))
  INTO v_meat_until
  FROM public.usage_items ui
  JOIN public.products p ON p.id = ui.product_id
  WHERE ui.treatment_id = p_treatment_id
    AND p.withdrawal_days_meat IS NOT NULL;
  
  -- Update the treatment with calculated dates
  UPDATE public.treatments
  SET 
    withdrawal_until_milk = v_milk_until,
    withdrawal_until_meat = v_meat_until
  WHERE id = p_treatment_id;
END;
$$ LANGUAGE plpgsql;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_treatments_animal_withdrawal ON public.treatments(animal_id, withdrawal_until_milk, withdrawal_until_meat);
CREATE INDEX IF NOT EXISTS idx_usage_items_treatment ON public.usage_items(treatment_id);
