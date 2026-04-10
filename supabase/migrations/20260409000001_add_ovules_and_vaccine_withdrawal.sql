-- =====================================================================
-- Add 'ovules' to product_category enum and enable vaccine withdrawal
-- =====================================================================
-- Created: 2026-04-09
-- Description: 
--   1. Adds 'ovules' to product_category enum (currently only in frontend)
--   2. Enables withdrawal period tracking for vaccines
-- =====================================================================

-- Add 'ovules' to product_category enum if not exists
DO $$ 
BEGIN
    -- Check if 'ovules' value already exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'ovules' 
        AND enumtypid = 'product_category'::regtype
    ) THEN
        -- Add 'ovules' to the enum
        ALTER TYPE product_category ADD VALUE 'ovules';
        RAISE NOTICE 'Added ovules to product_category enum';
    ELSE
        RAISE NOTICE 'ovules already exists in product_category enum';
    END IF;
END $$;

-- Add withdrawal fields to vaccinations table
ALTER TABLE vaccinations 
ADD COLUMN IF NOT EXISTS withdrawal_until_milk date,
ADD COLUMN IF NOT EXISTS withdrawal_until_meat date;

COMMENT ON COLUMN vaccinations.withdrawal_until_milk IS 'Calculated milk withdrawal end date based on vaccine product';
COMMENT ON COLUMN vaccinations.withdrawal_until_meat IS 'Calculated meat withdrawal end date based on vaccine product';

-- Create function to calculate withdrawal dates for vaccinations
CREATE OR REPLACE FUNCTION calculate_vaccination_withdrawal_dates(p_vaccination_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_vaccination_date date;
    v_product_id uuid;
    v_milk_days integer;
    v_meat_days integer;
    v_milk_until date;
    v_meat_until date;
BEGIN
    -- Get vaccination details
    SELECT vaccination_date, product_id 
    INTO v_vaccination_date, v_product_id
    FROM vaccinations 
    WHERE id = p_vaccination_id;

    -- Get product withdrawal days
    SELECT 
        COALESCE(withdrawal_days_milk, 0),
        COALESCE(withdrawal_days_meat, 0)
    INTO v_milk_days, v_meat_days
    FROM products
    WHERE id = v_product_id;

    -- Calculate withdrawal end dates
    IF v_milk_days > 0 THEN
        v_milk_until := v_vaccination_date + v_milk_days;
    ELSE
        v_milk_until := NULL;
    END IF;

    IF v_meat_days > 0 THEN
        v_meat_until := v_vaccination_date + v_meat_days;
    ELSE
        v_meat_until := NULL;
    END IF;

    -- Update vaccination record
    UPDATE vaccinations
    SET 
        withdrawal_until_milk = v_milk_until,
        withdrawal_until_meat = v_meat_until
    WHERE id = p_vaccination_id;

    RAISE NOTICE 'Calculated withdrawal for vaccination %: milk until %, meat until %', 
        p_vaccination_id, v_milk_until, v_meat_until;
END;
$$;

COMMENT ON FUNCTION calculate_vaccination_withdrawal_dates(uuid) IS 'Calculates and updates withdrawal dates for vaccinations based on product withdrawal periods';

-- Create trigger function for vaccination withdrawal calculation
CREATE OR REPLACE FUNCTION trigger_calculate_vaccination_withdrawal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    PERFORM calculate_vaccination_withdrawal_dates(NEW.id);
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION trigger_calculate_vaccination_withdrawal() IS 'Trigger wrapper for vaccination withdrawal date calculation';

-- Create trigger to auto-calculate withdrawal on vaccination insert/update
DROP TRIGGER IF EXISTS auto_calculate_vaccination_withdrawal ON vaccinations;
CREATE TRIGGER auto_calculate_vaccination_withdrawal 
AFTER INSERT OR UPDATE OF vaccination_date, product_id ON vaccinations
FOR EACH ROW 
EXECUTE FUNCTION trigger_calculate_vaccination_withdrawal();

-- Update the withdrawal status view to include vaccinations
-- Drop the view first to avoid column dependency issues
DROP VIEW IF EXISTS vw_withdrawal_status CASCADE;

CREATE VIEW vw_withdrawal_status AS
WITH treatment_withdrawals AS (
    SELECT 
        t.farm_id,
        t.animal_id,
        a.tag_no,
        MAX(t.withdrawal_until_milk) AS milk_until,
        MAX(t.withdrawal_until_meat) AS meat_until
    FROM treatments t
    LEFT JOIN animals a ON a.id = t.animal_id
    WHERE t.animal_id IS NOT NULL
    GROUP BY t.farm_id, t.animal_id, a.tag_no
),
vaccination_withdrawals AS (
    SELECT 
        v.farm_id,
        v.animal_id,
        a.tag_no,
        MAX(v.withdrawal_until_milk) AS milk_until,
        MAX(v.withdrawal_until_meat) AS meat_until
    FROM vaccinations v
    LEFT JOIN animals a ON a.id = v.animal_id
    WHERE v.animal_id IS NOT NULL
    GROUP BY v.farm_id, v.animal_id, a.tag_no
),
combined_withdrawals AS (
    SELECT 
        COALESCE(t.farm_id, v.farm_id) AS farm_id,
        COALESCE(t.animal_id, v.animal_id) AS animal_id,
        COALESCE(t.tag_no, v.tag_no) AS tag_no,
        GREATEST(t.milk_until, v.milk_until) AS milk_until,
        GREATEST(t.meat_until, v.meat_until) AS meat_until
    FROM treatment_withdrawals t
    FULL OUTER JOIN vaccination_withdrawals v 
        ON t.animal_id = v.animal_id AND t.farm_id = v.farm_id
)
SELECT 
    farm_id,
    animal_id,
    tag_no,
    milk_until,
    meat_until,
    CASE
        WHEN milk_until >= CURRENT_DATE THEN true
        ELSE false
    END AS milk_active,
    CASE
        WHEN meat_until >= CURRENT_DATE THEN true
        ELSE false
    END AS meat_active
FROM combined_withdrawals;

COMMENT ON VIEW vw_withdrawal_status IS 'Current withdrawal status for all animals including both treatments and vaccinations';

-- Create index for vaccination withdrawal queries
CREATE INDEX IF NOT EXISTS idx_vaccinations_withdrawal_milk 
ON vaccinations (farm_id, withdrawal_until_milk) 
WHERE withdrawal_until_milk IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vaccinations_withdrawal_meat 
ON vaccinations (farm_id, withdrawal_until_meat) 
WHERE withdrawal_until_meat IS NOT NULL;

-- Backfill withdrawal dates for existing vaccinations
DO $$
DECLARE
    v_count integer;
BEGIN
    -- Calculate withdrawal for all existing vaccinations
    PERFORM calculate_vaccination_withdrawal_dates(id)
    FROM vaccinations
    WHERE vaccination_date IS NOT NULL AND product_id IS NOT NULL;
    
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Backfilled withdrawal dates for % existing vaccinations', v_count;
END $$;
