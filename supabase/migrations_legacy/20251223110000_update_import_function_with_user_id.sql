/*
  # Update Milk Data Import Function with User ID Parameter

  1. Changes
    - Add optional `p_user_id` parameter to `import_milk_data` function
    - Function now accepts user_id for service role key automation
    - Falls back to auth.uid() if p_user_id is not provided
    - Allows n8n automation with service role key

  2. Parameters
    - `p_scraped_data` (jsonb): Complete scraped data
    - `p_user_id` (uuid, optional): User ID for service role automation

  3. Usage
    - For user JWT: Call without p_user_id, uses auth.uid()
    - For service role: Call with p_user_id parameter
*/

-- Update main import function to accept optional user_id
CREATE OR REPLACE FUNCTION import_milk_data(
  p_scraped_data jsonb,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_user_id uuid;
  v_producer_id uuid;
  v_gamintojo_id text;
  v_producer_data jsonb;
  v_composition_row jsonb;
  v_quality_row jsonb;
  v_total_producers integer := 0;
  v_total_composition integer := 0;
  v_total_quality integer := 0;
  v_errors text[] := ARRAY[]::text[];
  v_result jsonb;
BEGIN
  -- Get user ID: use parameter if provided, otherwise use auth.uid()
  v_user_id := COALESCE(p_user_id, auth.uid());

  -- Validate user ID
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Authentication required. Provide user_id parameter or use authenticated session.'
    );
  END IF;

  -- Validate input format
  IF p_scraped_data->>'results' IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid data format. Expected "results" object.'
    );
  END IF;

  -- Process each producer in results
  FOR v_gamintojo_id, v_producer_data IN SELECT * FROM jsonb_each(p_scraped_data->'results')
  LOOP
    BEGIN
      -- Upsert producer
      INSERT INTO milk_producers (
        user_id,
        gamintojo_id,
        label,
        imone,
        rajonas,
        punktas,
        gamintojas,
        updated_at
      ) VALUES (
        v_user_id,
        v_gamintojo_id,
        v_producer_data->>'label',
        v_producer_data->'meta'->>'imone',
        v_producer_data->'meta'->>'rajonas',
        v_producer_data->'meta'->>'punktas',
        v_producer_data->'meta'->>'gamintojas',
        now()
      )
      ON CONFLICT (user_id, gamintojo_id)
      DO UPDATE SET
        label = EXCLUDED.label,
        imone = EXCLUDED.imone,
        rajonas = EXCLUDED.rajonas,
        punktas = EXCLUDED.punktas,
        gamintojas = EXCLUDED.gamintojas,
        updated_at = EXCLUDED.updated_at
      RETURNING id INTO v_producer_id;

      v_total_producers := v_total_producers + 1;

      -- Import composition tests
      IF v_producer_data->'tables'->'pieno_sudeties_tyrimai'->'rows' IS NOT NULL THEN
        FOR v_composition_row IN SELECT * FROM jsonb_array_elements(v_producer_data->'tables'->'pieno_sudeties_tyrimai'->'rows')
        LOOP
          BEGIN
            INSERT INTO pieno_sudeties_tyrimai (
              producer_id,
              paemimo_data,
              atvezimo_data,
              tyrimo_data,
              riebalu_kiekis,
              baltymu_kiekis,
              laktozes_kiekis,
              persk_koef,
              ureja_mg_100ml,
              ph,
              pastaba,
              konteineris,
              plomba,
              prot_nr
            ) VALUES (
              v_producer_id,
              parse_milk_date(v_composition_row->>'paemimo_data'),
              parse_milk_date(v_composition_row->>'atvezimo_data'),
              parse_milk_date(v_composition_row->>'tyrimo_data'),
              (v_composition_row->>'riebalu_kiekis')::numeric,
              (v_composition_row->>'baltymu_kiekis')::numeric,
              (v_composition_row->>'laktozes_kiekis')::numeric,
              (v_composition_row->>'persk_koef')::numeric,
              (v_composition_row->>'ureja_mg_100ml')::numeric,
              (v_composition_row->>'ph')::numeric,
              COALESCE(v_composition_row->>'pastaba', ''),
              COALESCE(v_composition_row->>'konteineris', ''),
              COALESCE(v_composition_row->>'plomba', ''),
              COALESCE(v_composition_row->>'prot_nr', '')
            )
            ON CONFLICT (producer_id, paemimo_data, tyrimo_data, konteineris)
            DO UPDATE SET
              atvezimo_data = EXCLUDED.atvezimo_data,
              riebalu_kiekis = EXCLUDED.riebalu_kiekis,
              baltymu_kiekis = EXCLUDED.baltymu_kiekis,
              laktozes_kiekis = EXCLUDED.laktozes_kiekis,
              persk_koef = EXCLUDED.persk_koef,
              ureja_mg_100ml = EXCLUDED.ureja_mg_100ml,
              ph = EXCLUDED.ph,
              pastaba = EXCLUDED.pastaba,
              plomba = EXCLUDED.plomba,
              prot_nr = EXCLUDED.prot_nr;

            v_total_composition := v_total_composition + 1;
          EXCEPTION
            WHEN OTHERS THEN
              v_errors := array_append(v_errors, 'Composition test error for producer ' || v_gamintojo_id || ': ' || SQLERRM);
          END;
        END LOOP;
      END IF;

      -- Import quality tests
      IF v_producer_data->'tables'->'pieno_kokybes_tyrimai'->'rows' IS NOT NULL THEN
        FOR v_quality_row IN SELECT * FROM jsonb_array_elements(v_producer_data->'tables'->'pieno_kokybes_tyrimai'->'rows')
        LOOP
          BEGIN
            INSERT INTO pieno_kokybes_tyrimai (
              producer_id,
              paemimo_data,
              atvezimo_data,
              tyrimo_data,
              somatiniu_lasteliu_skaicius,
              bendras_bakteriju_skaicius,
              neatit_pst,
              konteineris,
              plomba,
              prot_nr
            ) VALUES (
              v_producer_id,
              parse_milk_date(v_quality_row->>'paemimo_data'),
              parse_milk_date(v_quality_row->>'atvezimo_data'),
              parse_milk_date(v_quality_row->>'tyrimo_data'),
              (v_quality_row->>'somatiniu_lasteliu_skaicius_tukst_ml')::numeric,
              (v_quality_row->>'bendras_bakteriju_skaicius_tukst_ml')::numeric,
              COALESCE(v_quality_row->>'neatit_pstsls_isk_l_bbs_isk_l', ''),
              COALESCE(v_quality_row->>'konteineris', ''),
              COALESCE(v_quality_row->>'plomba', ''),
              COALESCE(v_quality_row->>'prot_nr', '')
            )
            ON CONFLICT (producer_id, paemimo_data, tyrimo_data, konteineris)
            DO UPDATE SET
              atvezimo_data = EXCLUDED.atvezimo_data,
              somatiniu_lasteliu_skaicius = EXCLUDED.somatiniu_lasteliu_skaicius,
              bendras_bakteriju_skaicius = EXCLUDED.bendras_bakteriju_skaicius,
              neatit_pst = EXCLUDED.neatit_pst,
              plomba = EXCLUDED.plomba,
              prot_nr = EXCLUDED.prot_nr;

            v_total_quality := v_total_quality + 1;
          EXCEPTION
            WHEN OTHERS THEN
              v_errors := array_append(v_errors, 'Quality test error for producer ' || v_gamintojo_id || ': ' || SQLERRM);
          END;
        END LOOP;
      END IF;

    EXCEPTION
      WHEN OTHERS THEN
        v_errors := array_append(v_errors, 'Producer ' || v_gamintojo_id || ': ' || SQLERRM);
    END;
  END LOOP;

  -- Log the scrape operation
  BEGIN
    INSERT INTO milk_scrape_logs (
      user_id,
      scraped_at,
      url,
      date_from,
      date_to,
      producers_count,
      records_imported
    ) VALUES (
      v_user_id,
      (p_scraped_data->>'scraped_at')::timestamptz,
      p_scraped_data->>'url',
      parse_milk_date(p_scraped_data->'range'->>'from'),
      parse_milk_date(p_scraped_data->'range'->>'to'),
      v_total_producers,
      jsonb_build_object(
        'producers', v_total_producers,
        'composition_tests', v_total_composition,
        'quality_tests', v_total_quality
      )
    );
  EXCEPTION
    WHEN OTHERS THEN
      v_errors := array_append(v_errors, 'Failed to log scrape operation: ' || SQLERRM);
  END;

  -- Build result
  v_result := jsonb_build_object(
    'success', true,
    'imported', jsonb_build_object(
      'producers', v_total_producers,
      'compositionTests', v_total_composition,
      'qualityTests', v_total_quality
    )
  );

  -- Add errors if any occurred
  IF array_length(v_errors, 1) > 0 THEN
    v_result := v_result || jsonb_build_object('errors', to_jsonb(v_errors));
  END IF;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update comment
COMMENT ON FUNCTION import_milk_data(jsonb, uuid) IS 'Imports scraped milk test data. Accepts optional user_id for service role automation.';
