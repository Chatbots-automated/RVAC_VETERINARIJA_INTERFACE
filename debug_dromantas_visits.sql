-- Debug all visits for LT000008590896
SELECT json_build_object(
    'visits', (
        SELECT json_agg(
            json_build_object(
                'visit_id', av.id,
                'visit_datetime', av.visit_datetime,
                'status', av.status,
                'related_treatment_id', av.related_treatment_id,
                'planned_medications', av.planned_medications,
                'medications_processed', av.medications_processed,
                'usage_items_for_this_visit', (
                    SELECT json_agg(
                        json_build_object(
                            'usage_item_id', ui.id,
                            'product_name', p.name,
                            'qty', ui.qty,
                            'administered_date', ui.administered_date,
                            'created_at', ui.created_at
                        )
                    )
                    FROM public.usage_items ui
                    LEFT JOIN public.products p ON ui.product_id = p.id
                    WHERE ui.treatment_id = av.related_treatment_id
                )
            )
            ORDER BY av.visit_datetime
        )
        FROM public.animal_visits av
        WHERE av.animal_id = (
            SELECT id FROM public.animals WHERE tag_no = 'LT000008590896'
        )
        AND av.status = 'Baigtas'
    ),
    'treatment', (
        SELECT row_to_json(t)
        FROM (
            SELECT id, reg_date, created_at
            FROM public.treatments t
            WHERE t.animal_id = (
                SELECT id FROM public.animals WHERE tag_no = 'LT000008590896'
            )
        ) t
    )
) as debug_result;
