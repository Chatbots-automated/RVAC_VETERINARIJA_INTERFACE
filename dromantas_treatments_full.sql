-- Get all treatments for Dromantas Vaclovas farm
-- Returns everything in a single cell as JSON

SELECT json_build_object(
    'farm_info', (
        SELECT row_to_json(f)
        FROM (
            SELECT id, name, code
            FROM public.farms 
            WHERE code = '36603311157' OR name LIKE '%Dromantas%'
            LIMIT 1
        ) f
    ),
    'summary', (
        SELECT json_build_object(
            'total_treatments', COUNT(DISTINCT t.id),
            'total_animals_treated', COUNT(DISTINCT t.animal_id),
            'total_medications_used', COUNT(ui.id),
            'date_range', json_build_object(
                'first_treatment', MIN(t.reg_date),
                'last_treatment', MAX(t.reg_date)
            )
        )
        FROM public.treatments t
        LEFT JOIN public.usage_items ui ON t.id = ui.treatment_id
        WHERE t.farm_id IN (
            SELECT id FROM public.farms 
            WHERE code = '36603311157' OR name LIKE '%Dromantas%'
        )
    ),
    'treatments', (
        SELECT json_agg(
            json_build_object(
                'treatment_id', t.id,
                'registration_date', t.reg_date,
                'animal_tag', a.tag_no,
                'animal_species', a.species,
                'disease', d.name,
                'clinical_diagnosis', t.clinical_diagnosis,
                'tests_performed', t.tests,
                'animal_condition', t.animal_condition,
                'outcome', t.outcome,
                'outcome_date', t.outcome_date,
                'veterinarian', t.vet_name,
                'notes', t.notes,
                'withdrawal_until_meat', t.withdrawal_until_meat,
                'withdrawal_until_milk', t.withdrawal_until_milk,
                'first_symptoms_date', t.first_symptoms_date,
                'medications', (
                    SELECT json_agg(
                        json_build_object(
                            'product_name', p.name,
                            'category', p.category,
                            'quantity', ui.qty,
                            'unit', ui.unit,
                            'batch_lot', b.lot,
                            'batch_number', b.batch_number,
                            'administered_date', ui.administered_date,
                            'administration_route', ui.administration_route,
                            'purpose', ui.purpose,
                            'teat_position', ui.teat
                        )
                    )
                    FROM public.usage_items ui
                    LEFT JOIN public.products p ON ui.product_id = p.id
                    LEFT JOIN public.batches b ON ui.batch_id = b.id
                    WHERE ui.treatment_id = t.id
                ),
                'visit_info', (
                    SELECT row_to_json(v)
                    FROM (
                        SELECT 
                            av.visit_datetime,
                            av.temperature,
                            av.status,
                            av.procedures,
                            av.notes,
                            av.vet_name,
                            av.next_visit_required,
                            av.next_visit_date
                        FROM public.animal_visits av
                        WHERE av.id = t.visit_id
                    ) v
                )
            )
            ORDER BY t.reg_date DESC
        )
        FROM public.treatments t
        LEFT JOIN public.animals a ON t.animal_id = a.id
        LEFT JOIN public.diseases d ON t.disease_id = d.id
        WHERE t.farm_id IN (
            SELECT id FROM public.farms 
            WHERE code = '36603311157' OR name LIKE '%Dromantas%'
        )
    ),
    'animals', (
        SELECT json_agg(
            json_build_object(
                'tag_no', a.tag_no,
                'species', a.species,
                'sex', a.sex,
                'birth_date', a.birth_date,
                'treatment_count', (
                    SELECT COUNT(*)
                    FROM public.treatments t
                    WHERE t.animal_id = a.id
                ),
                'last_treatment_date', (
                    SELECT MAX(t.reg_date)
                    FROM public.treatments t
                    WHERE t.animal_id = a.id
                )
            )
        )
        FROM public.animals a
        WHERE a.farm_id IN (
            SELECT id FROM public.farms 
            WHERE code = '36603311157' OR name LIKE '%Dromantas%'
        )
    )
) as full_treatment_data;
