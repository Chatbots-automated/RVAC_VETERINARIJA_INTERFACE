-- Debug query for Dromantas Vaclovas farm allocations
-- Run this in Supabase SQL Editor

SELECT json_build_object(
    'farm_info', (
        SELECT json_build_object(
            'id', f.id,
            'name', f.name,
            'code', f.code
        )
        FROM public.farms f
        WHERE f.code = '36603311157' OR f.name LIKE '%Dromantas%'
        LIMIT 1
    ),
    'farm_stock_allocations_count', (
        SELECT COUNT(*)
        FROM public.farm_stock_allocations fsa
        WHERE fsa.farm_id IN (
            SELECT id FROM public.farms 
            WHERE code = '36603311157' OR name LIKE '%Dromantas%'
        )
    ),
    'batches_with_farm_id_count', (
        SELECT COUNT(*)
        FROM public.batches b
        WHERE b.farm_id IN (
            SELECT id FROM public.farms 
            WHERE code = '36603311157' OR name LIKE '%Dromantas%'
        )
    ),
    'batches_with_farm_id', (
        SELECT json_agg(row_to_json(b))
        FROM (
            SELECT 
                b.id,
                b.farm_id,
                b.allocation_id,
                b.product_id,
                b.received_qty,
                b.qty_left,
                b.purchase_price,
                b.lot,
                b.batch_number,
                p.name as product_name
            FROM public.batches b
            LEFT JOIN public.products p ON b.product_id = p.id
            WHERE b.farm_id IN (
                SELECT id FROM public.farms 
                WHERE code = '36603311157' OR name LIKE '%Dromantas%'
            )
            LIMIT 5
        ) b
    ),
    'view_result', (
        SELECT row_to_json(v)
        FROM (
            SELECT * FROM public.vw_allocation_analytics_by_farm
            WHERE farm_code = '36603311157' OR farm_name LIKE '%Dromantas%'
            LIMIT 1
        ) v
    )
) as debug_result;
