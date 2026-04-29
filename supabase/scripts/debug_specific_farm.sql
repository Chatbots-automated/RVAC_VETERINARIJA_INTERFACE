-- Debug specific farm: Andrius Petrauskas (fa4e9087-ef5c-46ae-974c-18cd2818334d)

-- Step 1: Check farm eco status
SELECT 
    'Farm eco status' as check,
    id,
    name,
    is_eco_farm,
    is_active
FROM farms
WHERE id = 'fa4e9087-ef5c-46ae-974c-18cd2818334d';

-- Step 2: Check treatments for this farm
SELECT 
    'Treatments for farm' as check,
    t.id,
    t.reg_date,
    t.withdrawal_until_meat,
    t.withdrawal_until_milk
FROM treatments t
WHERE t.farm_id = 'fa4e9087-ef5c-46ae-974c-18cd2818334d';

-- Step 3: Check usage_items and products for these treatments
SELECT 
    'Usage items with products' as check,
    ui.id as usage_item_id,
    ui.treatment_id,
    p.id as product_id,
    p.name as product_name,
    p.category as product_category,
    p.withdrawal_days_meat,
    p.withdrawal_days_milk
FROM usage_items ui
INNER JOIN treatments t ON ui.treatment_id = t.id
INNER JOIN products p ON ui.product_id = p.id
WHERE t.farm_id = 'fa4e9087-ef5c-46ae-974c-18cd2818334d';

-- Step 4: Try to get data from vw_withdrawal_report for this farm
SELECT 
    'From vw_withdrawal_report' as check,
    farm_id,
    farm_name,
    is_eco_farm,
    treatment_id,
    animal_tag,
    product_name,
    product_base_withdrawal_meat,
    product_base_withdrawal_milk,
    withdrawal_until_meat_original,
    withdrawal_until_meat,
    withdrawal_days_meat
FROM vw_withdrawal_report
WHERE farm_id = 'fa4e9087-ef5c-46ae-974c-18cd2818334d'
LIMIT 5;

-- Step 5: Check vw_treated_animals_detailed for same farm (this one works!)
SELECT 
    'From vw_treated_animals_detailed (working)' as check,
    farm_id,
    treatment_id,
    animal_tag,
    product_name,
    product_category
FROM vw_treated_animals_detailed
WHERE farm_id = 'fa4e9087-ef5c-46ae-974c-18cd2818334d'
LIMIT 5;
