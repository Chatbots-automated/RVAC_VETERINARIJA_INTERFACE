/*
  # Fix Withdrawal Calculation with Individual Course Durations

  ## Problem
  The current withdrawal calculation takes the MAX course duration across ALL medicines,
  then applies it to all withdrawal calculations. This is INCORRECT!

  Each medicine must calculate its OWN withdrawal date based on its OWN course duration.

  ## Correct Logic (per user requirement)

  ### Example:
  - Treatment started: Day 6
  - Medicine 1: 5-day withdrawal, 4-day course
    → Day 6 + 4 days + 5 days + 1 safety = Day 16 (safe on Day 16)
  - Medicine 2: 6-day withdrawal, 6-day course
    → Day 6 + 6 days + 6 days + 1 safety = Day 19 (safe on Day 19)
  - **Final result: Safe on Day 19** (maximum of all medicines)

  ## Solution
  Calculate withdrawal date for EACH medicine individually:
  1. For medicines in treatment_courses: use their specific course duration
  2. For medicines in usage_items (single dose): course duration = 1 day (actually 0, since single day)
  3. Take the MAXIMUM withdrawal date across all medicines

  Formula per medicine:
  - Last treatment day = reg_date + (course_days - 1)
  - Withdrawal date = last_treatment_day + withdrawal_days + 1
  - For single dose: withdrawal date = reg_date + withdrawal_days + 1

  ## Changes
  - Drop and recreate calculate_withdrawal_dates function with correct per-medicine logic
  - Consider both treatment_courses AND usage_items tables
  - Each medicine contributes its own withdrawal date, then we take MAX
*/

-- Drop existing function
DROP FUNCTION IF EXISTS public.calculate_withdrawal_dates(uuid);

-- Create corrected withdrawal calculation function
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

  -- Calculate milk withdrawal considering EACH medicine's course duration
  --
  -- Formula per user requirement:
  -- For courses: withdrawal_date = start_date + course_days + withdrawal_days + 1
  -- For single doses: withdrawal_date = start_date + 0 + withdrawal_days + 1
  --                                   = start_date + withdrawal_days + 1
  --
  -- Example:
  -- Medicine 1: Day 6 + 4 days + 5 withdrawal + 1 = Day 16
  -- Medicine 2: Day 6 + 6 days + 6 withdrawal + 1 = Day 19
  -- Result: Day 19 (max)

  WITH course_withdrawals AS (
    -- Medicines with multi-day courses
    SELECT
      v_reg_date + tc.days + COALESCE(p.withdrawal_days_milk, 0) + 1 as milk_date,
      v_reg_date + tc.days + COALESCE(p.withdrawal_days_meat, 0) + 1 as meat_date
    FROM public.treatment_courses tc
    JOIN public.products p ON p.id = tc.product_id
    WHERE tc.treatment_id = p_treatment_id
      AND p.category = 'medicines'
  ),
  single_dose_withdrawals AS (
    -- Medicines with single doses (not in courses)
    -- For single dose: course_days = 0, so formula becomes start_date + 0 + withdrawal + 1
    SELECT
      v_reg_date + COALESCE(p.withdrawal_days_milk, 0) + 1 as milk_date,
      v_reg_date + COALESCE(p.withdrawal_days_meat, 0) + 1 as meat_date
    FROM public.usage_items ui
    JOIN public.products p ON p.id = ui.product_id
    WHERE ui.treatment_id = p_treatment_id
      AND p.category = 'medicines'
      -- Only count single doses (not part of a course)
      AND NOT EXISTS (
        SELECT 1 FROM public.treatment_courses tc
        WHERE tc.treatment_id = p_treatment_id
          AND tc.product_id = ui.product_id
      )
  ),
  all_withdrawals AS (
    SELECT milk_date, meat_date FROM course_withdrawals
    UNION ALL
    SELECT milk_date, meat_date FROM single_dose_withdrawals
  )
  SELECT
    MAX(milk_date) INTO v_milk_until
  FROM all_withdrawals
  WHERE milk_date IS NOT NULL;

  SELECT
    MAX(meat_date) INTO v_meat_until
  FROM all_withdrawals
  WHERE meat_date IS NOT NULL;

  -- Update the treatment with calculated dates
  UPDATE public.treatments
  SET
    withdrawal_until_milk = v_milk_until,
    withdrawal_until_meat = v_meat_until
  WHERE id = p_treatment_id;

  -- Log for debugging
  RAISE NOTICE 'Treatment ID: %, Reg Date: %, Milk Until: %, Meat Until: %',
    p_treatment_id, v_reg_date, v_milk_until, v_meat_until;
END;
$$ LANGUAGE plpgsql;

-- Add helpful comment
COMMENT ON FUNCTION public.calculate_withdrawal_dates IS
'Calculates withdrawal periods for EACH medicine individually based on its course duration.
Formula: withdrawal_date = start_date + course_days + withdrawal_days + 1 (for courses)
         withdrawal_date = start_date + withdrawal_days + 1 (for single doses)
Takes the MAXIMUM across all medicines.

Example:
- Treatment starts: Day 6
- Medicine 1: 4-day course, 5-day withdrawal → 6 + 4 + 5 + 1 = Day 16
- Medicine 2: 6-day course, 6-day withdrawal → 6 + 6 + 6 + 1 = Day 19
- Result: Safe on Day 19 (max of all medicines)';
