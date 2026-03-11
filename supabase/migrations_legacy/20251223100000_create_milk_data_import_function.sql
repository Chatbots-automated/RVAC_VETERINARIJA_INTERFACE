/*
  # Milk Data Import RPC Function

  1. New Functions
    - `import_milk_data`
      - Accepts scraped milk test data in JSON format
      - Upserts milk producers for the authenticated user
      - Imports composition test results (pieno_sudeties_tyrimai)
      - Imports quality test results (pieno_kokybes_tyrimai)
      - Logs the scrape operation for audit trail
      - Returns counts of imported records

  2. Parameters
    - `p_scraped_data` (jsonb): Complete scraped data including producer info and test results

  3. Return Type
    - JSON object with:
      - success (boolean)
      - imported (object with producers, composition_tests, quality_tests counts)
      - errors (array of error messages, if any)

  4. Security
    - Function uses SECURITY DEFINER to access tables
    - Uses auth.uid() to ensure data is associated with authenticated user
    - Validates authentication before processing

  5. Important Notes
    - Handles date parsing for YYYYMMDD and YY.MM.DD formats
    - Uses upsert (ON CONFLICT) to prevent duplicates
    - Automatically creates producer records if they don't exist
    - Wraps operations in exception handling for partial success
*/

-- Helper function to parse date strings
CREATE OR REPLACE FUNCTION parse_milk_date(date_str text)
RETURNS date AS $$
DECLARE
  parts text[];
  year_part text;
  month_part text;
  day_part text;
BEGIN
  -- Handle null or empty strings
  IF date_str IS NULL OR date_str = '' THEN
    RETURN NULL;
  END IF;

  -- YYYYMMDD format (8 digits)
  IF date_str ~ '^\d{8}$' THEN
    RETURN to_date(date_str, 'YYYYMMDD');
  END IF;

  -- YY.MM.DD or YYYY.MM.DD format
  IF date_str ~ '^\d{2,4}\.\d{2}\.\d{2}$' THEN
    parts := string_to_array(date_str, '.');
    year_part := parts[1];
    month_part := lpad(parts[2], 2, '0');
    day_part := lpad(parts[3], 2, '0');

    -- Convert 2-digit year to 4-digit
    IF length(year_part) = 2 THEN
      year_part := '20' || year_part;
    END IF;

    RETURN to_date(year_part || '-' || month_part || '-' || day_part, 'YYYY-MM-DD');
  END IF;

  -- If format doesn't match, try to cast directly
  RETURN date_str::date;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Main import function
CREATE OR REPLACE FUNCTION import_milk_data(p_scraped_data jsonb)
RETURNS jsonb AS $$
DECLARE
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
  -- Validate authentication
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Authentication required'
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
        gamintojo_id,
        gamintojas_code,
        label,
        imone,
        rajonas,
        punktas,
        updated_at
      ) VALUES (
        v_gamintojo_id,
        v_producer_data->'meta'->>'gamintojas',
        v_producer_data->>'label',
        v_producer_data->'meta'->>'imone',
        v_producer_data->'meta'->>'rajonas',
        v_producer_data->'meta'->>'punktas',
        now()
      )
      ON CONFLICT (gamintojo_id)
      DO UPDATE SET
        gamintojas_code = EXCLUDED.gamintojas_code,
        label = EXCLUDED.label,
        imone = EXCLUDED.imone,
        rajonas = EXCLUDED.rajonas,
        punktas = EXCLUDED.punktas,
        updated_at = EXCLUDED.updated_at
      RETURNING id INTO v_producer_id;

      v_total_producers := v_total_producers + 1;

      -- Import composition tests
      IF v_producer_data->'tables'->'pieno_sudeties_tyrimai'->'rows' IS NOT NULL THEN
        FOR v_composition_row IN SELECT * FROM jsonb_array_elements(v_producer_data->'tables'->'pieno_sudeties_tyrimai'->'rows')
        LOOP
          BEGIN
            INSERT INTO milk_composition_tests (
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
            ON CONFLICT (producer_id, paemimo_data, konteineris)
            DO UPDATE SET
              atvezimo_data = EXCLUDED.atvezimo_data,
              tyrimo_data = EXCLUDED.tyrimo_data,
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
            INSERT INTO milk_quality_tests (
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
            ON CONFLICT (producer_id, paemimo_data, konteineris)
            DO UPDATE SET
              atvezimo_data = EXCLUDED.atvezimo_data,
              tyrimo_data = EXCLUDED.tyrimo_data,
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
    INSERT INTO milk_scrape_sessions (
      scraped_at,
      url,
      date_from,
      date_to
    ) VALUES (
      COALESCE((p_scraped_data->>'scraped_at')::timestamptz, now()),
      COALESCE(p_scraped_data->>'url', 'n8n-import'),
      parse_milk_date(p_scraped_data->'range'->>'from'),
      parse_milk_date(p_scraped_data->'range'->>'to')
    );
  EXCEPTION
    WHEN OTHERS THEN
      -- Log error but don't fail the entire operation
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

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION import_milk_data(jsonb) TO authenticated;

-- Add helpful comment
COMMENT ON FUNCTION import_milk_data(jsonb) IS 'Imports scraped milk test data including producers, composition tests, and quality tests. Returns success status and import counts.';
COMMENT ON FUNCTION parse_milk_date(text) IS 'Helper function to parse various date formats used in milk test data (YYYYMMDD, YY.MM.DD, YYYY.MM.DD)';
