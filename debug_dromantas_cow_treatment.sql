-- Debug query for LT000008590896 treatment
-- Returns everything in a single cell as JSON

SELECT json_build_object(
    'animal_info', (
        SELECT row_to_json(a)
        FROM (
            SELECT id, tag_no, species, sex, birth_date
            FROM public.animals
            WHERE tag_no = 'LT000008590896'
        ) a
    ),
    'treatment_info', (
        SELECT row_to_json(t)
        FROM (
            SELECT 
                t.id,
                t.reg_date,
                t.disease_id,
                t.clinical_diagnosis,
                t.tests,
                t.outcome,
                t.outcome_date,
                t.vet_name,
                t.visit_id,
                t.withdrawal_until_meat,
                t.withdrawal_until_milk
            FROM public.treatments t
            JOIN public.animals a ON t.animal_id = a.id
            WHERE a.tag_no = 'LT000008590896'
        ) t
    ),
    'usage_items', (
        SELECT json_agg(row_to_json(ui))
        FROM (
            SELECT 
                ui.id,
                ui.treatment_id,
                ui.product_id,
                ui.qty,
                ui.unit,
                ui.administered_date,
                ui.administration_route,
                ui.purpose,
                ui.batch_id,
                p.name as product_name,
                b.lot,
                b.batch_number
            FROM public.usage_items ui
            LEFT JOIN public.products p ON ui.product_id = p.id
            LEFT JOIN public.batches b ON ui.batch_id = b.id
            WHERE ui.treatment_id IN (
                SELECT t.id FROM public.treatments t
                JOIN public.animals a ON t.animal_id = a.id
                WHERE a.tag_no = 'LT000008590896'
            )
            ORDER BY ui.administered_date, ui.created_at
        ) ui
    ),
    'visit_info', (
        SELECT row_to_json(av)
        FROM (
            SELECT 
                av.id,
                av.visit_datetime,
                av.temperature,
                av.status,
                av.procedures,
                av.notes,
                av.related_treatment_id,
                av.planned_medications
            FROM public.animal_visits av
            WHERE av.id IN (
                SELECT t.visit_id FROM public.treatments t
                JOIN public.animals a ON t.animal_id = a.id
                WHERE a.tag_no = 'LT000008590896'
            )
        ) av
    ),
    'view_rows', (
        SELECT json_agg(row_to_json(v))
        FROM (
            SELECT *
            FROM public.vw_treated_animals_detailed
            WHERE animal_tag = 'LT000008590896'
            ORDER BY registration_date, created_at
        ) v
    )
) as debug_result;
