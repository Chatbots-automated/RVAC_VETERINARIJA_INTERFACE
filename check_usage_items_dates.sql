-- Check the actual administered_date for each usage_item
SELECT 
    ui.id,
    ui.treatment_id,
    ui.product_id,
    p.name as product_name,
    ui.qty,
    ui.administered_date,
    ui.created_at
FROM public.usage_items ui
LEFT JOIN public.products p ON ui.product_id = p.id
WHERE ui.treatment_id = 'aa0405f2-6b00-41c2-aeef-1ea35652aa25'
ORDER BY ui.administered_date, ui.created_at;
