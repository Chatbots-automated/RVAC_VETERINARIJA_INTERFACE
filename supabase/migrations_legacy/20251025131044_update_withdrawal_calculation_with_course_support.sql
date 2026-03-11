/*
  # Update Withdrawal Calculation to Count from Last Treatment Day

  ## Critical Business Logic Change
  
  **IMPORTANT:** Withdrawal periods MUST start counting from the LAST day of treatment,
  not the first day. This is crucial for multi-day courses.
  
  ### Example:
  - Treatment starts: Day 10
  - Course length: 3 days (Day 10, 11, 12)
  - Last treatment day: Day 12
  - Medicine withdrawal: 5 days for milk
  - Safety margin: +1 day
  - **Safe to milk: Day 12 + 5 + 1 = Day 18 (on Day 19 it's safe)**
  
  ### Changes:
  1. Find the last treatment day (course end date or single treatment date)
  2. Add withdrawal days from the product
  3. Add +1 safety day
  4. Store as withdrawal_until_meat and withdrawal_until_milk
  
  ## Security
  - Function maintains existing permissions
  - Only calculates dates, doesn't modify access controls
*/

-- Drop and recreate the withdrawal calculation function with correct logic
CREATE OR REPLACE FUNCTION public.calculate_withdrawal_dates(p_treatment_id uuid)
RETURNS void AS $$
DECLARE
  v_reg_date date;
  v_last_treatment_date date;
  v_milk_until date;
  v_meat_until date;
  v_max_course_days integer;
BEGIN
  -- Get the treatment registration date
  SELECT reg_date INTO v_reg_date
  FROM public.treatments
  WHERE id = p_treatment_id;
  
  -- Find the maximum course length for this treatment
  -- If there are courses, find the longest one
  SELECT COALESCE(MAX(days), 0) INTO v_max_course_days
  FROM public.treatment_courses
  WHERE treatment_id = p_treatment_id;
  
  -- Calculate the last treatment date
  -- If it's a course, last date = start_date + (days - 1)
  -- If no course, last date = reg_date
  IF v_max_course_days > 0 THEN
    -- For courses, the last treatment day is start_date + (days - 1)
    v_last_treatment_date := v_reg_date + (v_max_course_days - 1);
  ELSE
    -- Single treatment, last day is the treatment day itself
    v_last_treatment_date := v_reg_date;
  END IF;
  
  -- Calculate milk withdrawal: last_treatment_date + withdrawal_days + 1 safety day
  -- Take the MAX across all products used in this treatment
  SELECT MAX(v_last_treatment_date + COALESCE(p.withdrawal_days_milk, 0) + 1)
  INTO v_milk_until
  FROM public.usage_items ui
  JOIN public.products p ON p.id = ui.product_id
  WHERE ui.treatment_id = p_treatment_id
    AND p.category = 'medicines'
    AND p.withdrawal_days_milk IS NOT NULL;
  
  -- Calculate meat withdrawal: last_treatment_date + withdrawal_days + 1 safety day
  -- Take the MAX across all products used in this treatment
  SELECT MAX(v_last_treatment_date + COALESCE(p.withdrawal_days_meat, 0) + 1)
  INTO v_meat_until
  FROM public.usage_items ui
  JOIN public.products p ON p.id = ui.product_id
  WHERE ui.treatment_id = p_treatment_id
    AND p.category = 'medicines'
    AND p.withdrawal_days_meat IS NOT NULL;
  
  -- Update the treatment with calculated dates
  UPDATE public.treatments
  SET 
    withdrawal_until_milk = v_milk_until,
    withdrawal_until_meat = v_meat_until
  WHERE id = p_treatment_id;
  
  -- Log for debugging (optional, can be removed in production)
  RAISE NOTICE 'Treatment: %, Reg: %, Last: %, Milk: %, Meat: %', 
    p_treatment_id, v_reg_date, v_last_treatment_date, v_milk_until, v_meat_until;
END;
$$ LANGUAGE plpgsql;

-- Add helpful comment on the function
COMMENT ON FUNCTION public.calculate_withdrawal_dates IS 
'Calculates withdrawal periods starting from the LAST treatment day (including multi-day courses) + withdrawal days + 1 safety day. 
Example: Course from Day 10-12 (3 days), 5-day milk withdrawal = safe on Day 19 (12 + 5 + 1 + 1).';
