-- Fix administered_date for Dromantas Vaclovas cow treatment
-- This is a one-time fix for old data created before the multi-day course fix

-- Update each usage_item with the correct administered_date
-- Based on the order they were created (created_at timestamp)

UPDATE public.usage_items
SET administered_date = '2026-04-14'
WHERE id = '6eb20a2e-66df-42be-bd14-2550187225ac'; -- First (06:14:04)

UPDATE public.usage_items
SET administered_date = '2026-04-15'
WHERE id = '8002695c-5b55-40c2-9c2f-e0ea0dc2fbce'; -- Second (06:14:05.041)

UPDATE public.usage_items
SET administered_date = '2026-04-16'
WHERE id = '89842c84-7890-4fc1-ac3b-0d4c9e6f6728'; -- Third (06:14:05.152)

UPDATE public.usage_items
SET administered_date = '2026-04-17'
WHERE id = '0acb41ee-1075-4244-9e5f-78740841dbde'; -- Fourth (06:14:05.272)

UPDATE public.usage_items
SET administered_date = '2026-04-18'
WHERE id = 'c5be75e6-b88b-49da-be81-cb57590a1c1c'; -- Fifth (06:14:05.378)

-- Verify the fix
SELECT 
    ui.id,
    ui.administered_date,
    p.name as product_name,
    ui.qty,
    ui.created_at
FROM public.usage_items ui
LEFT JOIN public.products p ON ui.product_id = p.id
WHERE ui.treatment_id = 'aa0405f2-6b00-41c2-aeef-1ea35652aa25'
ORDER BY ui.administered_date;
