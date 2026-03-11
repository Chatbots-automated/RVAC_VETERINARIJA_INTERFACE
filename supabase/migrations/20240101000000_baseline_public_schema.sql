--
-- PostgreSQL database dump
--

-- \restrict EDzbElkTtxG1psRHPqQpMZabDhk04uJCqa6r8p21rBLGO6uIp9JU6uOXYNewSPq

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
-- SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";

--
-- Name: SCHEMA "public"; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA "public" IS 'Old gea_daily table dropped on 2026-02-04. Use new GEA system with gea_daily_upload() RPC.';


--
-- Name: product_category; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."product_category" AS ENUM (
    'medicines',
    'prevention',
    'reproduction',
    'treatment_materials',
    'hygiene',
    'biocide',
    'technical',
    'svirkstukai',
    'bolusas',
    'vakcina'
);


ALTER TYPE "public"."product_category" OWNER TO "postgres";

--
-- Name: unit; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."unit" AS ENUM (
    'ml',
    'l',
    'g',
    'kg',
    'pcs',
    'vnt',
    'tablet',
    'bolus',
    'syringe'
);


ALTER TYPE "public"."unit" OWNER TO "postgres";

--
-- Name: auto_generate_medical_waste("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."auto_generate_medical_waste"("p_batch_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_batch_record RECORD;
  v_product_record RECORD;
  v_waste_id uuid;
  v_waste_code text;
  v_waste_name text;
  v_total_weight numeric;
BEGIN
  -- Check if this batch already has waste generated
  IF EXISTS (SELECT 1 FROM public.batch_waste_tracking WHERE batch_id = p_batch_id) THEN
    -- Already processed, return existing waste_id
    SELECT medical_waste_id INTO v_waste_id
    FROM public.batch_waste_tracking
    WHERE batch_id = p_batch_id;
    RETURN v_waste_id;
  END IF;

  -- Get batch details
  SELECT b.*, b.package_count as pkg_count
  INTO v_batch_record
  FROM public.batches b
  WHERE b.id = p_batch_id;

  IF NOT FOUND THEN
    RAISE NOTICE 'Batch % not found', p_batch_id;
    RETURN NULL;
  END IF;

  -- Get product details
  SELECT p.*
  INTO v_product_record
  FROM public.products p
  WHERE p.id = v_batch_record.product_id;

  IF NOT FOUND THEN
    RAISE NOTICE 'Product not found for batch %', p_batch_id;
    RETURN NULL;
  END IF;

  -- Exit if product doesn't have package weight configured
  IF v_product_record.package_weight_g IS NULL THEN
    RAISE NOTICE 'Product % does not have package_weight_g configured, skipping waste generation', v_product_record.name;
    RETURN NULL;
  END IF;

  -- Exit if package_count is NULL or zero
  IF v_batch_record.pkg_count IS NULL OR v_batch_record.pkg_count <= 0 THEN
    RAISE NOTICE 'Batch % has invalid package_count, skipping waste generation', p_batch_id;
    RETURN NULL;
  END IF;

  -- Calculate total weight (package_count × package_weight_g)
  v_total_weight := v_batch_record.pkg_count * v_product_record.package_weight_g;

  -- Determine waste code based on product category
  CASE v_product_record.category
    WHEN 'medicines' THEN v_waste_code := '18 02 02';
    WHEN 'vakcina' THEN v_waste_code := '18 02 02';
    WHEN 'prevention' THEN v_waste_code := '18 02 02';
    WHEN 'svirkstukai' THEN v_waste_code := '18 02 01';
    ELSE v_waste_code := '18 02 02';
  END CASE;

  -- Generate descriptive waste name
  IF v_batch_record.lot IS NOT NULL THEN
    v_waste_name := v_product_record.name || ' - Partija ' || v_batch_record.lot;
  ELSE
    v_waste_name := v_product_record.name || ' - Tuščios pakuotės';
  END IF;

  -- Insert medical waste record
  INSERT INTO public.medical_waste (
    waste_code,
    name,
    date,
    qty_generated,
    auto_generated,
    source_batch_id,
    source_product_id,
    package_count
  )
  VALUES (
    v_waste_code,
    v_waste_name,
    CURRENT_DATE,
    v_total_weight,
    true,
    p_batch_id,
    v_batch_record.product_id,
    v_batch_record.pkg_count
  )
  RETURNING id INTO v_waste_id;

  -- Record in batch_waste_tracking to prevent duplicates
  INSERT INTO public.batch_waste_tracking (
    batch_id,
    medical_waste_id,
    waste_generated_at
  )
  VALUES (
    p_batch_id,
    v_waste_id,
    now()
  );

  RAISE NOTICE 'Auto-generated medical waste % for batch % (Product: %, Weight: %g)',
    v_waste_id, p_batch_id, v_product_record.name, v_total_weight;

  RETURN v_waste_id;
END;
$$;


ALTER FUNCTION "public"."auto_generate_medical_waste"("p_batch_id" "uuid") OWNER TO "postgres";

--
-- Name: FUNCTION "auto_generate_medical_waste"("p_batch_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."auto_generate_medical_waste"("p_batch_id" "uuid") IS 'Automatically creates medical waste entry when batch is fully depleted. Prevents duplicates.';


--
-- Name: auto_link_milk_test_to_weight(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."auto_link_milk_test_to_weight"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_weight_id uuid;
  v_producer_label text;
BEGIN
  -- Only process if milk_weight_id is not already set
  -- and the test date is in the past
  IF NEW.milk_weight_id IS NULL AND NEW.paemimo_data <= CURRENT_DATE THEN

    -- Get the producer label
    SELECT label INTO v_producer_label
    FROM milk_producers
    WHERE id = NEW.producer_id;

    -- Find matching milk weight record
    -- Match on: date = paemimo_data AND session_type = producer.label
    SELECT id INTO v_weight_id
    FROM milk_weights
    WHERE date = NEW.paemimo_data
      AND session_type = v_producer_label
    LIMIT 1;

    -- If found, link it
    IF v_weight_id IS NOT NULL THEN
      NEW.milk_weight_id := v_weight_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."auto_link_milk_test_to_weight"() OWNER TO "postgres";

--
-- Name: FUNCTION "auto_link_milk_test_to_weight"(); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."auto_link_milk_test_to_weight"() IS 'Automatically links new or updated milk test records to corresponding milk weights.';


--
-- Name: auto_split_usage_items(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."auto_split_usage_items"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
v_batch_qty_left numeric;
v_remaining_qty numeric;
v_batch record;
v_allocated_qty numeric;
v_product_id uuid;
v_total_available numeric;
v_is_splitting boolean;
BEGIN
-- Check if we're already in a split operation (prevents infinite recursion)
BEGIN
v_is_splitting := current_setting('app.is_splitting_usage_items')::boolean;
EXCEPTION
WHEN OTHERS THEN
v_is_splitting := false;
END;

-- If we're already splitting, just pass through
IF v_is_splitting THEN
RETURN NEW;
END IF;

-- Get the batch's current qty_left and product_id
SELECT b.qty_left, b.product_id INTO v_batch_qty_left, v_product_id
FROM batches b
WHERE b.id = NEW.batch_id;

IF NOT FOUND THEN
RAISE EXCEPTION 'Batch not found: %', NEW.batch_id;
END IF;

-- If batch has enough stock, proceed normally
IF v_batch_qty_left >= NEW.qty THEN
RETURN NEW;
END IF;

RAISE NOTICE 'Batch % only has %, need %. Starting auto-split...', 
NEW.batch_id, v_batch_qty_left, NEW.qty;

-- Check total available stock
SELECT COALESCE(SUM(qty_left), 0) INTO v_total_available
FROM batches
WHERE product_id = v_product_id
AND qty_left > 0;

IF v_total_available < NEW.qty THEN
RAISE EXCEPTION 'Nepakanka atsargų! Turima iš viso: %, Reikia: %', v_total_available, NEW.qty;
END IF;

-- Set flag to indicate we're splitting (prevents recursion)
PERFORM set_config('app.is_splitting_usage_items', 'true', true);

BEGIN
v_remaining_qty := NEW.qty;

-- Loop through available batches in FIFO order
FOR v_batch IN
SELECT id, qty_left
FROM batches
WHERE product_id = v_product_id
AND qty_left > 0
ORDER BY expiry_date ASC, created_at ASC
LOOP
-- Calculate how much to allocate from this batch
v_allocated_qty := LEAST(v_batch.qty_left, v_remaining_qty);

-- Insert a new usage_item for this batch portion
INSERT INTO usage_items (
treatment_id,
vaccination_id,
biocide_usage_id,
product_id,
batch_id,
qty,
unit,
purpose,
teat
) VALUES (
NEW.treatment_id,
NEW.vaccination_id,
NEW.biocide_usage_id,
NEW.product_id,
v_batch.id,
v_allocated_qty,
NEW.unit,
NEW.purpose,
NEW.teat
);

RAISE NOTICE 'Sukurtas padalintas įrašas: serija %, kiekis %', v_batch.id, v_allocated_qty;

v_remaining_qty := v_remaining_qty - v_allocated_qty;

-- Exit if we've allocated everything
IF v_remaining_qty <= 0.001 THEN
EXIT;
END IF;
END LOOP;

-- Clear the splitting flag
PERFORM set_config('app.is_splitting_usage_items', 'false', true);

IF v_remaining_qty > 0.001 THEN
RAISE EXCEPTION 'Nepavyko pilnai paskirstyti. Liko: %', v_remaining_qty;
END IF;

EXCEPTION
WHEN OTHERS THEN
-- Clear flag on error
PERFORM set_config('app.is_splitting_usage_items', 'false', true);
RAISE;
END;

-- Prevent the original INSERT since we've created split records
RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."auto_split_usage_items"() OWNER TO "postgres";

--
-- Name: calculate_average_daily_milk("uuid", "date"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."calculate_average_daily_milk"("p_animal_id" "uuid", "p_before_date" "date" DEFAULT CURRENT_DATE) RETURNS numeric
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_avg_milk numeric;
BEGIN
  -- Get the latest milk_avg (Pieno vidurkis) before the specified date
  -- This is already an average calculated by GEA, no additional averaging needed
  SELECT COALESCE(milk_avg, 0)
  INTO v_avg_milk
  FROM gea_daily
  WHERE animal_id = p_animal_id
    AND snapshot_date < p_before_date
    AND milk_avg IS NOT NULL
    AND milk_avg > 0
  ORDER BY snapshot_date DESC
  LIMIT 1;

  RETURN COALESCE(v_avg_milk, 0);
END;
$$;


ALTER FUNCTION "public"."calculate_average_daily_milk"("p_animal_id" "uuid", "p_before_date" "date") OWNER TO "postgres";

--
-- Name: FUNCTION "calculate_average_daily_milk"("p_animal_id" "uuid", "p_before_date" "date"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."calculate_average_daily_milk"("p_animal_id" "uuid", "p_before_date" "date") IS 'Gets the latest milk_avg (Pieno vidurkis) for an animal before a specified date - no additional averaging needed';


--
-- Name: calculate_milk_loss_for_synchronization("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."calculate_milk_loss_for_synchronization"("p_animal_id" "uuid", "p_sync_id" "uuid") RETURNS TABLE("total_days" integer, "avg_daily_milk" numeric, "total_milk_lost" numeric, "milk_loss_value" numeric, "milk_price_per_kg" numeric, "sync_start_date" "date", "sync_end_date" "date")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_sync_start date;
  v_sync_end date;
  v_avg_milk numeric;
  v_total_days integer;
  v_milk_price numeric;
BEGIN
  -- Get synchronization start date
  SELECT start_date
  INTO v_sync_start
  FROM animal_synchronizations
  WHERE id = p_sync_id;

  -- If no sync found, return zeros
  IF v_sync_start IS NULL THEN
    RETURN QUERY SELECT 0, 0::numeric, 0::numeric, 0::numeric, 0::numeric, NULL::date, NULL::date;
    RETURN;
  END IF;

  -- Calculate end date as the max scheduled_date from synchronization steps
  SELECT MAX(scheduled_date)
  INTO v_sync_end
  FROM synchronization_steps
  WHERE synchronization_id = p_sync_id;

  -- If no steps found, use start_date + 14 days as default
  IF v_sync_end IS NULL THEN
    v_sync_end := v_sync_start + INTERVAL '14 days';
  END IF;

  -- Calculate days in sync period
  v_total_days := (v_sync_end - v_sync_start) + 1;

  -- Get average daily milk production before synchronization started
  v_avg_milk := calculate_average_daily_milk(p_animal_id, v_sync_start);

  -- Get milk price from system settings
  SELECT COALESCE(setting_value::numeric, 0.40)
  INTO v_milk_price
  FROM system_settings
  WHERE setting_key = 'milk_price_per_liter'
  LIMIT 1;

  -- Return calculated values
  RETURN QUERY SELECT
    v_total_days,
    v_avg_milk,
    v_avg_milk * v_total_days,
    (v_avg_milk * v_total_days) * v_milk_price,
    v_milk_price,
    v_sync_start,
    v_sync_end;
END;
$$;


ALTER FUNCTION "public"."calculate_milk_loss_for_synchronization"("p_animal_id" "uuid", "p_sync_id" "uuid") OWNER TO "postgres";

--
-- Name: FUNCTION "calculate_milk_loss_for_synchronization"("p_animal_id" "uuid", "p_sync_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."calculate_milk_loss_for_synchronization"("p_animal_id" "uuid", "p_sync_id" "uuid") IS 'Calculates total milk loss and financial impact for an animal synchronization period';


--
-- Name: calculate_next_service_date("date", integer, "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."calculate_next_service_date"("p_last_service_date" "date", "p_interval_value" integer, "p_interval_type" "text") RETURNS "date"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
BEGIN
  IF p_last_service_date IS NULL THEN
    RETURN NULL;
  END IF;
  
  RETURN CASE p_interval_type
    WHEN 'days' THEN p_last_service_date + (p_interval_value || ' days')::interval
    WHEN 'weeks' THEN p_last_service_date + (p_interval_value || ' weeks')::interval
    WHEN 'months' THEN p_last_service_date + (p_interval_value || ' months')::interval
    WHEN 'years' THEN p_last_service_date + (p_interval_value || ' years')::interval
    ELSE NULL
  END;
END;
$$;


ALTER FUNCTION "public"."calculate_next_service_date"("p_last_service_date" "date", "p_interval_value" integer, "p_interval_type" "text") OWNER TO "postgres";

--
-- Name: calculate_received_qty(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."calculate_received_qty"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- If both package_size and package_count are provided, calculate received_qty
  IF NEW.package_size IS NOT NULL AND NEW.package_count IS NOT NULL THEN
    NEW.received_qty := NEW.package_size * NEW.package_count;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."calculate_received_qty"() OWNER TO "postgres";

--
-- Name: calculate_treatment_milk_loss("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."calculate_treatment_milk_loss"("p_treatment_id" "uuid") RETURNS TABLE("withdrawal_days" integer, "safety_days" integer, "total_loss_days" integer, "avg_daily_milk_kg" numeric, "total_milk_lost_kg" numeric, "milk_price_eur_per_kg" numeric, "total_value_lost_eur" numeric, "treatment_date" "date", "withdrawal_until" "date", "animal_tag" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_treatment_date date;
  v_withdrawal_until date;
  v_animal_id uuid;
  v_animal_tag text;
  v_withdrawal_days integer;
  v_safety_days integer := 1; -- Always add 1 day for safety
  v_total_days integer;
  v_avg_milk numeric;
  v_milk_price numeric;
BEGIN
  -- Get treatment details
  SELECT
    t.reg_date,
    t.withdrawal_until_milk,
    t.animal_id,
    a.tag_no
  INTO
    v_treatment_date,
    v_withdrawal_until,
    v_animal_id,
    v_animal_tag
  FROM treatments t
  JOIN animals a ON a.id = t.animal_id
  WHERE t.id = p_treatment_id;

  -- If no treatment found or no withdrawal period, return zeros
  IF v_treatment_date IS NULL OR v_withdrawal_until IS NULL THEN
    RETURN QUERY SELECT
      0, 0, 0,
      0::numeric, 0::numeric, 0::numeric, 0::numeric,
      NULL::date, NULL::date, NULL::text;
    RETURN;
  END IF;

  -- Calculate withdrawal days (from treatment date to withdrawal end date)
  v_withdrawal_days := (v_withdrawal_until - v_treatment_date);

  -- Total days includes safety buffer
  v_total_days := v_withdrawal_days + v_safety_days;

  -- Get average daily milk production at treatment date
  v_avg_milk := get_animal_avg_milk_at_date(v_animal_id, v_treatment_date);

  -- Get milk price from system settings
  SELECT COALESCE(setting_value::numeric, 0.45)
  INTO v_milk_price
  FROM system_settings
  WHERE setting_key = 'milk_price_per_liter'
  LIMIT 1;

  -- Return calculated values
  RETURN QUERY SELECT
    v_withdrawal_days,
    v_safety_days,
    v_total_days,
    v_avg_milk,
    v_avg_milk * v_total_days,
    v_milk_price,
    (v_avg_milk * v_total_days) * v_milk_price,
    v_treatment_date,
    v_withdrawal_until,
    v_animal_tag;
END;
$$;


ALTER FUNCTION "public"."calculate_treatment_milk_loss"("p_treatment_id" "uuid") OWNER TO "postgres";

--
-- Name: FUNCTION "calculate_treatment_milk_loss"("p_treatment_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."calculate_treatment_milk_loss"("p_treatment_id" "uuid") IS 'Calculates milk loss and financial impact for a treatment based on withdrawal period';


--
-- Name: calculate_withdrawal_dates("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."calculate_withdrawal_dates"("p_treatment_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_reg_date date;
  v_milk_until date;
  v_meat_until date;
BEGIN
  SELECT reg_date INTO v_reg_date FROM public.treatments WHERE id = p_treatment_id;

  -- MILK: Only products with withdrawal_days_milk > 0
  WITH course_milk AS (
    SELECT v_reg_date + tc.days + p.withdrawal_days_milk + 1 as wd
    FROM public.treatment_courses tc
    JOIN public.products p ON p.id = tc.product_id
    WHERE tc.treatment_id = p_treatment_id 
      AND p.category = 'medicines' 
      AND p.withdrawal_days_milk > 0
  ),
  single_milk AS (
    SELECT v_reg_date + p.withdrawal_days_milk + 1 as wd
    FROM public.usage_items ui
    JOIN public.products p ON p.id = ui.product_id
    WHERE ui.treatment_id = p_treatment_id 
      AND p.category = 'medicines' 
      AND p.withdrawal_days_milk > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.treatment_courses tc 
        WHERE tc.treatment_id = p_treatment_id 
          AND tc.product_id = ui.product_id
      )
  ),
  all_milk AS (
    SELECT wd FROM course_milk 
    UNION ALL 
    SELECT wd FROM single_milk
  )
  SELECT MAX(wd) INTO v_milk_until FROM all_milk;

  -- MEAT: Only products with withdrawal_days_meat > 0
  WITH course_meat AS (
    SELECT v_reg_date + tc.days + p.withdrawal_days_meat + 1 as wd
    FROM public.treatment_courses tc
    JOIN public.products p ON p.id = tc.product_id
    WHERE tc.treatment_id = p_treatment_id 
      AND p.category = 'medicines' 
      AND p.withdrawal_days_meat > 0
  ),
  single_meat AS (
    SELECT v_reg_date + p.withdrawal_days_meat + 1 as wd
    FROM public.usage_items ui
    JOIN public.products p ON p.id = ui.product_id
    WHERE ui.treatment_id = p_treatment_id 
      AND p.category = 'medicines' 
      AND p.withdrawal_days_meat > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.treatment_courses tc 
        WHERE tc.treatment_id = p_treatment_id 
          AND tc.product_id = ui.product_id
      )
  ),
  all_meat AS (
    SELECT wd FROM course_meat 
    UNION ALL 
    SELECT wd FROM single_meat
  )
  SELECT MAX(wd) INTO v_meat_until FROM all_meat;

  UPDATE public.treatments 
  SET withdrawal_until_milk = v_milk_until, 
      withdrawal_until_meat = v_meat_until 
  WHERE id = p_treatment_id;
END;
$$;


ALTER FUNCTION "public"."calculate_withdrawal_dates"("p_treatment_id" "uuid") OWNER TO "postgres";

--
-- Name: cancel_animal_synchronization_protocols("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."cancel_animal_synchronization_protocols"("p_animal_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_cancelled_count INTEGER := 0;
  v_sync_record RECORD;
BEGIN
  FOR v_sync_record IN
    SELECT id
    FROM animal_synchronizations
    WHERE animal_id = p_animal_id
      AND status = 'Active'
  LOOP
    -- Update the synchronization protocol status to Cancelled
    UPDATE animal_synchronizations
    SET
      status = 'Cancelled',
      notes = COALESCE(notes || E'\n\n', '') || 'Automatiškai atšaukta dėl APSĖK statuso (' || NOW()::DATE || ')',
      updated_at = NOW()
    WHERE id = v_sync_record.id;

    -- Cancel all incomplete synchronization steps (do not deduct stock)
    UPDATE synchronization_steps
    SET
      notes = COALESCE(notes || E'\n', '') || 'Atšaukta dėl APSĖK statuso',
      updated_at = NOW()
    WHERE synchronization_id = v_sync_record.id
      AND completed = FALSE;

    -- Cancel associated visits that haven't been completed
    -- THIS IS THE KEY FIX: Update ALL incomplete visits, not just those with sync_step_id
    UPDATE animal_visits
    SET
      status = 'Atšauktas',
      notes = COALESCE(notes || E'\n\n', '') || 'Automatiškai atšaukta: gyvūnas apsėklintas (APSĖK statusas)',
      updated_at = NOW()
    WHERE sync_step_id IN (
      SELECT id
      FROM synchronization_steps
      WHERE synchronization_id = v_sync_record.id
    )
    AND status IN ('Planuojamas', 'Suplanuota');  -- Only cancel planned visits, not completed ones

    v_cancelled_count := v_cancelled_count + 1;
  END LOOP;

  RETURN v_cancelled_count;
END;
$$;


ALTER FUNCTION "public"."cancel_animal_synchronization_protocols"("p_animal_id" "uuid") OWNER TO "postgres";

--
-- Name: check_batch_depletion(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."check_batch_depletion"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_current_stock numeric;
  v_waste_id uuid;
BEGIN
  -- Calculate current stock for the batch
  SELECT COALESCE(
    (
      SELECT b.received_qty - COALESCE(SUM(ui.qty), 0)
      FROM public.batches b
      LEFT JOIN public.usage_items ui ON ui.batch_id = b.id
      WHERE b.id = NEW.batch_id
      GROUP BY b.id, b.received_qty
    ),
    0
  ) INTO v_current_stock;

  -- If stock reached exactly 0, trigger waste generation
  IF v_current_stock <= 0 THEN
    -- Attempt to generate waste (function handles duplicates)
    v_waste_id := public.auto_generate_medical_waste(NEW.batch_id);

    IF v_waste_id IS NOT NULL THEN
      RAISE NOTICE 'Batch % depleted, waste entry % created', NEW.batch_id, v_waste_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_batch_depletion"() OWNER TO "postgres";

--
-- Name: FUNCTION "check_batch_depletion"(); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."check_batch_depletion"() IS 'Trigger function that detects when batch stock reaches 0 and generates waste entry';


--
-- Name: check_batch_stock(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."check_batch_stock"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
v_qty_left numeric;
v_batch_number text;
v_product_name text;
v_product_id uuid;
v_total_available numeric;
v_is_splitting boolean;
BEGIN
-- Check if we're in a split operation
BEGIN
v_is_splitting := current_setting('app.is_splitting_usage_items')::boolean;
EXCEPTION
WHEN OTHERS THEN
v_is_splitting := false;
END;

-- If we're splitting, the auto-split function has already validated total stock
IF v_is_splitting THEN
RETURN NEW;
END IF;

IF NEW.batch_id IS NOT NULL THEN
SELECT b.qty_left, b.batch_number, p.name, p.id
INTO v_qty_left, v_batch_number, v_product_name, v_product_id
FROM batches b
JOIN products p ON b.product_id = p.id
WHERE b.id = NEW.batch_id;

IF NOT FOUND THEN
RAISE EXCEPTION 'Serija nerasta: %', NEW.batch_id;
END IF;

IF v_qty_left IS NULL THEN
RAISE EXCEPTION 'Serijos % (%) qty_left yra NULL', v_batch_number, v_product_name;
END IF;

-- If single batch doesn't have enough, check total available across all batches
IF v_qty_left < NEW.qty THEN
SELECT COALESCE(SUM(qty_left), 0) INTO v_total_available
FROM batches
WHERE product_id = v_product_id
AND qty_left > 0;

IF v_total_available < NEW.qty THEN
RAISE EXCEPTION 'Nepakanka atsargų produktui "%". Turima iš viso: %, Reikia: %',
v_product_name, v_total_available, NEW.qty;
END IF;

-- If we have enough total stock, this will be auto-split
-- The auto-split trigger will handle creating multiple records
RAISE NOTICE 'Vienos serijos nepakanka (%). Bus automatiškai padalinta tarp % serijų. Turima iš viso: %',
v_qty_left, 
(SELECT COUNT(*) FROM batches WHERE product_id = v_product_id AND qty_left > 0), 
v_total_available;
END IF;
END IF;

RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_batch_stock"() OWNER TO "postgres";

--
-- Name: FUNCTION "check_batch_stock"(); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."check_batch_stock"() IS 'Validates that sufficient stock exists before allowing usage_items insertion';


--
-- Name: check_course_completion(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."check_course_completion"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
UPDATE public.treatment_courses
SET 
status = 'completed',
doses_administered = (
SELECT COUNT(*) 
FROM public.course_doses 
WHERE course_id = NEW.course_id 
AND administered_date IS NOT NULL
)
WHERE id = NEW.course_id
AND (
SELECT COUNT(*) 
FROM public.course_doses 
WHERE course_id = NEW.course_id 
AND administered_date IS NOT NULL
) >= (
SELECT days 
FROM public.treatment_courses 
WHERE id = NEW.course_id
);

RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_course_completion"() OWNER TO "postgres";

--
-- Name: complete_synchronization_step("uuid", "uuid", numeric, "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."complete_synchronization_step"("p_step_id" "uuid", "p_batch_id" "uuid" DEFAULT NULL::"uuid", "p_actual_dosage" numeric DEFAULT NULL::numeric, "p_actual_unit" "text" DEFAULT NULL::"text", "p_notes" "text" DEFAULT NULL::"text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_step_record record;
BEGIN
  SELECT * INTO v_step_record
  FROM public.synchronization_steps
  WHERE id = p_step_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Step not found';
  END IF;

  IF v_step_record.completed THEN
    RAISE EXCEPTION 'Step already completed';
  END IF;

  UPDATE public.synchronization_steps
  SET
    completed = true,
    completed_at = now(),
    batch_id = p_batch_id,
    dosage = COALESCE(p_actual_dosage, dosage),
    dosage_unit = COALESCE(p_actual_unit, dosage_unit),
    notes = COALESCE(p_notes, notes)
  WHERE id = p_step_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.synchronization_steps
    WHERE synchronization_id = v_step_record.synchronization_id
    AND completed = false
  ) THEN
    UPDATE public.animal_synchronizations
    SET status = 'Completed'
    WHERE id = v_step_record.synchronization_id;
  END IF;

  RETURN true;
END;
$$;


ALTER FUNCTION "public"."complete_synchronization_step"("p_step_id" "uuid", "p_batch_id" "uuid", "p_actual_dosage" numeric, "p_actual_unit" "text", "p_notes" "text") OWNER TO "postgres";

--
-- Name: course_has_flexible_schedule("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."course_has_flexible_schedule"("p_course_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_has_flexible boolean;
BEGIN
  SELECT medication_schedule_flexible INTO v_has_flexible
  FROM treatment_courses
  WHERE id = p_course_id;

  RETURN COALESCE(v_has_flexible, false);
END;
$$;


ALTER FUNCTION "public"."course_has_flexible_schedule"("p_course_id" "uuid") OWNER TO "postgres";

--
-- Name: create_course_doses(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."create_course_doses"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
i integer;
BEGIN
FOR i IN 1..NEW.days LOOP
INSERT INTO public.course_doses (
course_id,
day_number,
scheduled_date,
dose_amount,
unit
) VALUES (
NEW.id,
i,
NEW.start_date + (i - 1),
NEW.daily_dose,
NEW.unit
);
END LOOP;

RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."create_course_doses"() OWNER TO "postgres";

--
-- Name: create_usage_item_from_vaccination(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."create_usage_item_from_vaccination"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Only create usage_item if we have a batch_id and dose_amount
  IF NEW.batch_id IS NOT NULL AND NEW.dose_amount IS NOT NULL AND NEW.dose_amount > 0 THEN

    -- Insert into usage_items with vaccination-specific purpose
    INSERT INTO usage_items (
      treatment_id,
      product_id,
      batch_id,
      qty,
      unit,
      purpose,
      vaccination_id,
      created_at
    ) VALUES (
      NULL,  -- vaccinations don't have treatment_id
      NEW.product_id,
      NEW.batch_id,
      NEW.dose_amount,
      NEW.unit::unit,  -- FIXED: Cast to unit enum type
      'vaccination',  -- Mark as vaccination for tracking
      NEW.id,  -- Link back to vaccination
      NEW.created_at
    );

    RAISE NOTICE 'Created usage_item for vaccination %. Product: %, Batch: %, Qty: % %',
      NEW.id,
      NEW.product_id,
      NEW.batch_id,
      NEW.dose_amount,
      NEW.unit;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."create_usage_item_from_vaccination"() OWNER TO "postgres";

--
-- Name: create_user("text", "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."create_user"("p_email" "text", "p_password" "text", "p_role" "text" DEFAULT 'viewer'::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
new_user_id uuid;
BEGIN
INSERT INTO public.users (email, password_hash, role)
VALUES (p_email, crypt(p_password, gen_salt('bf')), p_role)
RETURNING id INTO new_user_id;

RETURN new_user_id;
END;
$$;


ALTER FUNCTION "public"."create_user"("p_email" "text", "p_password" "text", "p_role" "text") OWNER TO "postgres";

--
-- Name: deactivate_missing_animals("text"[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."deactivate_missing_animals"("_current_tag_nos" "text"[]) RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
update public.animals a
set active = false
where a.active = true
  and not (a.tag_no = any(_current_tag_nos));
$$;


ALTER FUNCTION "public"."deactivate_missing_animals"("_current_tag_nos" "text"[]) OWNER TO "postgres";

--
-- Name: deduct_equipment_stock(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."deduct_equipment_stock"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
-- Deduct from batch
UPDATE equipment_batches
SET qty_left = qty_left - NEW.quantity
WHERE id = NEW.batch_id;

-- Check if stock went negative
IF (SELECT qty_left FROM equipment_batches WHERE id = NEW.batch_id) < 0 THEN
RAISE EXCEPTION 'Insufficient stock in batch. Available: %, Requested: %', 
(SELECT qty_left + NEW.quantity FROM equipment_batches WHERE id = NEW.batch_id), 
NEW.quantity;
END IF;

-- Log movement
INSERT INTO equipment_stock_movements (
batch_id, 
movement_type, 
quantity, 
reference_table, 
reference_id,
notes
) VALUES (
NEW.batch_id, 
'issue', 
NEW.quantity, 
'equipment_issuance_items', 
NEW.id,
'Issued via issuance'
);

RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."deduct_equipment_stock"() OWNER TO "postgres";

--
-- Name: deduct_farm_equipment_service_stock(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."deduct_farm_equipment_service_stock"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_qty_left numeric;
  v_batch_number text;
BEGIN
  -- Get current batch info
  SELECT qty_left, batch_number
  INTO v_qty_left, v_batch_number
  FROM equipment_batches
  WHERE id = NEW.batch_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Batch % not found', NEW.batch_id;
  END IF;
  
  -- Check if sufficient stock
  IF v_qty_left < NEW.quantity_used THEN
    RAISE EXCEPTION 'Insufficient stock in batch %. Available: %, Required: %',
      v_batch_number, v_qty_left, NEW.quantity_used;
  END IF;
  
  -- Deduct from batch
  UPDATE equipment_batches
  SET qty_left = qty_left - NEW.quantity_used
  WHERE id = NEW.batch_id;
  
  -- Log movement
  INSERT INTO equipment_stock_movements (
    batch_id,
    movement_type,
    quantity,
    reference_table,
    reference_id,
    notes
  ) VALUES (
    NEW.batch_id,
    'issue',
    NEW.quantity_used,
    'farm_equipment_service_parts',
    NEW.id,
    'Used in farm equipment maintenance'
  );
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."deduct_farm_equipment_service_stock"() OWNER TO "postgres";

--
-- Name: deduct_sync_step_medication(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."deduct_sync_step_medication"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_qty_left numeric;
  v_lot text;
  v_dosage_qty numeric;
BEGIN
  -- Only process when step is being marked as completed (false -> true transition)
  IF NEW.completed = TRUE AND COALESCE(OLD.completed, FALSE) = FALSE THEN

    -- Must have both batch_id and dosage
    IF NEW.batch_id IS NOT NULL AND NEW.dosage IS NOT NULL THEN

      v_dosage_qty := NEW.dosage::numeric;

      -- Lock the batch row to prevent race conditions / double deductions
      SELECT qty_left, lot
        INTO v_qty_left, v_lot
      FROM batches
      WHERE id = NEW.batch_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Batch % not found for sync step %', NEW.batch_id, NEW.id;
      END IF;

      -- Check if sufficient stock available
      IF v_qty_left < v_dosage_qty THEN
        RAISE EXCEPTION
          'Insufficient stock in batch % (%). Available: %, Required: %',
          v_lot, NEW.batch_id, v_qty_left, v_dosage_qty;
      END IF;

      -- Deduct stock from batch
      UPDATE batches
      SET qty_left = qty_left - v_dosage_qty,
          updated_at = NOW()
      WHERE id = NEW.batch_id;

      RAISE NOTICE 'Deducted % units from batch % (%) for sync step %',
        v_dosage_qty, v_lot, NEW.batch_id, NEW.id;

    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."deduct_sync_step_medication"() OWNER TO "postgres";

--
-- Name: deduct_work_order_parts(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."deduct_work_order_parts"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.batch_id IS NOT NULL THEN
    UPDATE equipment_batches SET qty_left = qty_left - NEW.quantity WHERE id = NEW.batch_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."deduct_work_order_parts"() OWNER TO "postgres";

--
-- Name: determine_session_type(timestamp with time zone, "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."determine_session_type"("measurement_time" timestamp with time zone, "tz" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  local_hour integer;
BEGIN
  -- Convert to local time and extract hour
  local_hour := EXTRACT(HOUR FROM (measurement_time AT TIME ZONE tz));

  -- Morning session (rytinis): 6am-3pm (6-14)
  IF local_hour >= 6 AND local_hour < 15 THEN
    RETURN 'rytinis';
  -- Evening session (naktinis): 3pm-6am (15-5)
  ELSE
    RETURN 'naktinis';
  END IF;
END;
$$;


ALTER FUNCTION "public"."determine_session_type"("measurement_time" timestamp with time zone, "tz" "text") OWNER TO "postgres";

--
-- Name: fn_check_usage_constraints(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."fn_check_usage_constraints"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_exp date;
  v_left numeric;
begin
  select expiry_date into v_exp from public.batches where id = NEW.batch_id;

  if v_exp is not null and v_exp < current_date then
    raise exception 'Cannot use expired batch (expiry: %).', v_exp;
  end if;

  select on_hand into v_left from public.stock_by_batch where batch_id = NEW.batch_id;
  if v_left is null then v_left := 0; end if;

  if NEW.qty > v_left then
    raise exception 'Not enough stock in batch. Left: %, Tried: %', v_left, NEW.qty;
  end if;

  return NEW;
end;
$$;


ALTER FUNCTION "public"."fn_check_usage_constraints"() OWNER TO "postgres";

--
-- Name: fn_fifo_batch("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."fn_fifo_batch"("p_product_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE
    AS $$
  select b.id
  from public.batches b
  left join public.stock_by_batch sb on sb.batch_id = b.id
  where b.product_id = p_product_id
    and coalesce(sb.on_hand,0) > 0
    and (b.expiry_date is null or b.expiry_date >= current_date)
  order by b.expiry_date nulls last, b.mfg_date nulls last, b.doc_date nulls last
  limit 1;
$$;


ALTER FUNCTION "public"."fn_fifo_batch"("p_product_id" "uuid") OWNER TO "postgres";

--
-- Name: freeze_user("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."freeze_user"("p_user_id" "uuid", "p_admin_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  admin_role text;
BEGIN
  -- Check if the admin has admin role
  SELECT role INTO admin_role
  FROM public.users
  WHERE id = p_admin_id;

  IF admin_role != 'admin' THEN
    RAISE EXCEPTION 'Only admins can freeze users';
  END IF;

  -- Freeze the user
  UPDATE public.users
  SET is_frozen = true,
      frozen_at = now(),
      frozen_by = p_admin_id,
      updated_at = now()
  WHERE id = p_user_id;

  -- Log the action
  PERFORM public.log_user_action(
    p_admin_id,
    'freeze_user',
    'users',
    p_user_id,
    jsonb_build_object('is_frozen', false),
    jsonb_build_object('is_frozen', true, 'frozen_by', p_admin_id)
  );

  RETURN FOUND;
END;
$$;


ALTER FUNCTION "public"."freeze_user"("p_user_id" "uuid", "p_admin_id" "uuid") OWNER TO "postgres";

--
-- Name: gea_daily_upload("jsonb"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."gea_daily_upload"("payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_import_id uuid;

  v_meta jsonb := coalesce(payload->'meta', '{}'::jsonb);
  v_counts jsonb := coalesce(v_meta->'counts', '{}'::jsonb);
  v_markers jsonb := coalesce(v_meta->'markers', '{}'::jsonb);

  v_at1 jsonb := coalesce(payload->'ataskaita1', '[]'::jsonb);
  v_at2 jsonb := coalesce(payload->'ataskaita2', '[]'::jsonb);
  v_at3 jsonb := coalesce(payload->'ataskaita3', '[]'::jsonb);

  v_count1 int := coalesce(nullif(v_counts->>'ataskaita1','')::int, jsonb_array_length(v_at1));
  v_count2 int := coalesce(nullif(v_counts->>'ataskaita2','')::int, jsonb_array_length(v_at2));
  v_count3 int := coalesce(nullif(v_counts->>'ataskaita3','')::int, jsonb_array_length(v_at3));

  v_user uuid := auth.uid();
begin
  -- Create import batch
  insert into public.gea_daily_imports (
    created_by,
    marker_i1, marker_i2, marker_i3,
    count_ataskaita1, count_ataskaita2, count_ataskaita3
  )
  values (
    v_user,
    nullif(v_markers->>'i1','')::int,
    nullif(v_markers->>'i2','')::int,
    nullif(v_markers->>'i3','')::int,
    v_count1, v_count2, v_count3
  )
  returning id into v_import_id;

  -- ---------------- AT1 ----------------
  if jsonb_typeof(v_at1) = 'array' and jsonb_array_length(v_at1) > 0 then
    insert into public.gea_daily_ataskaita1 (
      import_id,
      cow_number, ear_number, cow_state, group_number,
      pregnant_since, lactation_days, inseminated_at, pregnant_days,
      next_pregnancy_date, days_until_waiting_pregnancy,
      raw
    )
    select
      v_import_id,
      nullif(btrim(x->>'cow_number'), ''),
      nullif(btrim(x->>'ear_number'), ''),
      nullif(btrim(x->>'cow_state'), ''),
      nullif(btrim(x->>'group_number'), ''),
      public.safe_date(x->>'pregnant_since'),
      public.safe_int(x->>'lactation_days'),
      public.safe_date(x->>'inseminated_at'),
      public.safe_int(x->>'pregnant_days'),
      public.safe_date(x->>'next_pregnancy_date'),
      public.safe_int(x->>'days_until_waiting_pregnancy'),
      x
    from jsonb_array_elements(v_at1) as x
    where coalesce(nullif(btrim(x->>'cow_number'), ''), '') <> ''
    on conflict (import_id, cow_number) do update
      set ear_number = excluded.ear_number,
          cow_state = excluded.cow_state,
          group_number = excluded.group_number,
          pregnant_since = excluded.pregnant_since,
          lactation_days = excluded.lactation_days,
          inseminated_at = excluded.inseminated_at,
          pregnant_days = excluded.pregnant_days,
          next_pregnancy_date = excluded.next_pregnancy_date,
          days_until_waiting_pregnancy = excluded.days_until_waiting_pregnancy,
          raw = excluded.raw;
  end if;

  -- ---------------- AT2 ----------------
  -- IMPORTANT: we precompute numeric fields via safe_numeric in a CTE.
  -- This prevents ANY implicit numeric casting from touching "******".
  if jsonb_typeof(v_at2) = 'array' and jsonb_array_length(v_at2) > 0 then

    with src as (
      select x
      from jsonb_array_elements(v_at2) as x
      where coalesce(nullif(btrim(x->>'cow_number'), ''), '') <> ''
    ),
    norm as (
      select
        x,
        nullif(btrim(x->>'cow_number'), '') as cow_number,
        nullif(btrim(x->>'genetic_worth'), '') as genetic_worth,
        nullif(btrim(x->>'blood_line'), '') as blood_line,

        public.safe_numeric(x->>'avg_milk_prod_weight') as avg_milk_prod_weight,
        public.safe_bool_lt(x->>'produce_milk') as produce_milk,

        public.safe_date(x->>'last_milking_date') as last_milking_date,
        nullif(btrim(x->>'last_milking_time'), '') as last_milking_time,
        public.safe_numeric(x->>'last_milking_weight') as last_milking_weight,

        (
          select coalesce(jsonb_agg(m) filter (where m is not null), '[]'::jsonb)
          from (
            values
              (case when coalesce(x->>'milking_date_1','')<>'' or coalesce(x->>'milking_time_1','')<>'' or coalesce(x->>'milking_weight_1','')<>'' then
                jsonb_build_object('idx',1,'date',public.safe_date(x->>'milking_date_1'),'time',nullif(btrim(x->>'milking_time_1'),''),'weight',public.safe_numeric(x->>'milking_weight_1')) end),
              (case when coalesce(x->>'milking_date_2','')<>'' or coalesce(x->>'milking_time_2','')<>'' or coalesce(x->>'milking_weight_2','')<>'' then
                jsonb_build_object('idx',2,'date',public.safe_date(x->>'milking_date_2'),'time',nullif(btrim(x->>'milking_time_2'),''),'weight',public.safe_numeric(x->>'milking_weight_2')) end),
              (case when coalesce(x->>'milking_date_3','')<>'' or coalesce(x->>'milking_time_3','')<>'' or coalesce(x->>'milking_weight_3','')<>'' then
                jsonb_build_object('idx',3,'date',public.safe_date(x->>'milking_date_3'),'time',nullif(btrim(x->>'milking_time_3'),''),'weight',public.safe_numeric(x->>'milking_weight_3')) end),
              (case when coalesce(x->>'milking_date_4','')<>'' or coalesce(x->>'milking_time_4','')<>'' or coalesce(x->>'milking_weight_4','')<>'' then
                jsonb_build_object('idx',4,'date',public.safe_date(x->>'milking_date_4'),'time',nullif(btrim(x->>'milking_time_4'),''),'weight',public.safe_numeric(x->>'milking_weight_4')) end),
              (case when coalesce(x->>'milking_date_5','')<>'' or coalesce(x->>'milking_time_5','')<>'' or coalesce(x->>'milking_weight_5','')<>'' then
                jsonb_build_object('idx',5,'date',public.safe_date(x->>'milking_date_5'),'time',nullif(btrim(x->>'milking_time_5'),''),'weight',public.safe_numeric(x->>'milking_weight_5')) end),
              (case when coalesce(x->>'milking_date_6','')<>'' or coalesce(x->>'milking_time_6','')<>'' or coalesce(x->>'milking_weight_6','')<>'' then
                jsonb_build_object('idx',6,'date',public.safe_date(x->>'milking_date_6'),'time',nullif(btrim(x->>'milking_time_6'),''),'weight',public.safe_numeric(x->>'milking_weight_6')) end),
              (case when coalesce(x->>'milking_date_7','')<>'' or coalesce(x->>'milking_time_7','')<>'' or coalesce(x->>'milking_weight_7','')<>'' then
                jsonb_build_object('idx',7,'date',public.safe_date(x->>'milking_date_7'),'time',nullif(btrim(x->>'milking_time_7'),''),'weight',public.safe_numeric(x->>'milking_weight_7')) end),
              (case when coalesce(x->>'milking_date_8','')<>'' or coalesce(x->>'milking_time_8','')<>'' or coalesce(x->>'milking_weight_8','')<>'' then
                jsonb_build_object('idx',8,'date',public.safe_date(x->>'milking_date_8'),'time',nullif(btrim(x->>'milking_time_8'),''),'weight',public.safe_numeric(x->>'milking_weight_8')) end),
              (case when coalesce(x->>'milking_date_9','')<>'' or coalesce(x->>'milking_time_9','')<>'' or coalesce(x->>'milking_weight_9','')<>'' then
                jsonb_build_object('idx',9,'date',public.safe_date(x->>'milking_date_9'),'time',nullif(btrim(x->>'milking_time_9'),''),'weight',public.safe_numeric(x->>'milking_weight_9')) end)
          ) as t(m)
        ) as milkings
      from src
    )
    insert into public.gea_daily_ataskaita2 (
      import_id,
      cow_number, genetic_worth, blood_line, avg_milk_prod_weight, produce_milk,
      last_milking_date, last_milking_time, last_milking_weight,
      milkings,
      raw
    )
    select
      v_import_id,
      n.cow_number,
      n.genetic_worth,
      n.blood_line,
      n.avg_milk_prod_weight,
      n.produce_milk,
      n.last_milking_date,
      n.last_milking_time,
      n.last_milking_weight,
      n.milkings,
      n.x
    from norm n
    on conflict (import_id, cow_number) do update
      set genetic_worth = excluded.genetic_worth,
          blood_line = excluded.blood_line,
          avg_milk_prod_weight = excluded.avg_milk_prod_weight,
          produce_milk = excluded.produce_milk,
          last_milking_date = excluded.last_milking_date,
          last_milking_time = excluded.last_milking_time,
          last_milking_weight = excluded.last_milking_weight,
          milkings = excluded.milkings,
          raw = excluded.raw;

  end if;

  -- ---------------- AT3 ----------------
  if jsonb_typeof(v_at3) = 'array' and jsonb_array_length(v_at3) > 0 then
    insert into public.gea_daily_ataskaita3 (
      import_id,
      cow_number,
      teat_missing_right_back,
      teat_missing_back_left,
      teat_missing_front_left,
      teat_missing_front_right,
      insemination_count,
      bull_1, bull_2, bull_3,
      lactation_number,
      raw
    )
    select
      v_import_id,
      nullif(btrim(x->>'cow_number'), ''),
      public.safe_bool_lt(x->>'teat_missing_right_back'),
      public.safe_bool_lt(x->>'teat_missing_back_left'),
      public.safe_bool_lt(x->>'teat_missing_front_left'),
      public.safe_bool_lt(x->>'teat_missing_front_right'),
      public.safe_int(x->>'insemination_count'),
      nullif(btrim(x->>'bull_1'), ''),
      nullif(btrim(x->>'bull_2'), ''),
      nullif(btrim(x->>'bull_3'), ''),
      public.safe_int(x->>'lactation_number'),
      x
    from jsonb_array_elements(v_at3) as x
    where coalesce(nullif(btrim(x->>'cow_number'), ''), '') <> ''
    on conflict (import_id, cow_number) do update
      set teat_missing_right_back = excluded.teat_missing_right_back,
          teat_missing_back_left = excluded.teat_missing_back_left,
          teat_missing_front_left = excluded.teat_missing_front_left,
          teat_missing_front_right = excluded.teat_missing_front_right,
          insemination_count = excluded.insemination_count,
          bull_1 = excluded.bull_1,
          bull_2 = excluded.bull_2,
          bull_3 = excluded.bull_3,
          lactation_number = excluded.lactation_number,
          raw = excluded.raw;
  end if;

  return jsonb_build_object(
    'import_id', v_import_id,
    'counts', jsonb_build_object(
      'ataskaita1', v_count1,
      'ataskaita2', v_count2,
      'ataskaita3', v_count3
    )
  );
end;
$$;


ALTER FUNCTION "public"."gea_daily_upload"("payload" "jsonb") OWNER TO "postgres";

--
-- Name: generate_equipment_issuance_number(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."generate_equipment_issuance_number"() RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
next_num integer;
new_number text;
BEGIN
SELECT COALESCE(MAX(CAST(SUBSTRING(issuance_number FROM 'ISS-(.*)') AS INTEGER)), 0) + 1
INTO next_num
FROM equipment_issuances;

new_number := 'ISS-' || LPAD(next_num::text, 6, '0');
RETURN new_number;
END;
$$;


ALTER FUNCTION "public"."generate_equipment_issuance_number"() OWNER TO "postgres";

--
-- Name: generate_work_order_number(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."generate_work_order_number"() RETURNS "text"
    LANGUAGE "plpgsql"
    AS $_$
DECLARE
  next_num integer;
  new_number text;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(work_order_number FROM 'WO-(.*)') AS INTEGER)), 0) + 1
  INTO next_num
  FROM maintenance_work_orders
  WHERE work_order_number ~ '^WO-[0-9]+$';

  new_number := 'WO-' || LPAD(next_num::text, 6, '0');
  RETURN new_number;
END;
$_$;


ALTER FUNCTION "public"."generate_work_order_number"() OWNER TO "postgres";

--
-- Name: get_animal_avg_milk_at_date("uuid", "date"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_animal_avg_milk_at_date"("p_animal_id" "uuid", "p_date" "date") RETURNS numeric
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_avg_milk numeric;
BEGIN
  -- Get the latest milk_avg (Pieno vidurkis) at or before the specified date
  -- This is already an average calculated by GEA, no additional averaging needed
  SELECT COALESCE(milk_avg, 0)
  INTO v_avg_milk
  FROM gea_daily
  WHERE animal_id = p_animal_id
    AND snapshot_date <= p_date
    AND milk_avg IS NOT NULL
    AND milk_avg > 0
  ORDER BY snapshot_date DESC
  LIMIT 1;

  RETURN COALESCE(v_avg_milk, 0);
END;
$$;


ALTER FUNCTION "public"."get_animal_avg_milk_at_date"("p_animal_id" "uuid", "p_date" "date") OWNER TO "postgres";

--
-- Name: FUNCTION "get_animal_avg_milk_at_date"("p_animal_id" "uuid", "p_date" "date"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."get_animal_avg_milk_at_date"("p_animal_id" "uuid", "p_date" "date") IS 'Gets the latest milk_avg (Pieno vidurkis) for an animal at a specific date - no additional averaging needed';


--
-- Name: get_course_progress("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_course_progress"("p_course_id" "uuid") RETURNS TABLE("total_visits" integer, "completed_visits" integer, "pending_visits" integer, "next_visit_date" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::integer as total_visits,
    COUNT(*) FILTER (WHERE status = 'Baigtas')::integer as completed_visits,
    COUNT(*) FILTER (WHERE status != 'Baigtas' AND status != 'Atšauktas')::integer as pending_visits,
    MIN(visit_datetime) FILTER (WHERE status != 'Baigtas' AND status != 'Atšauktas') as next_visit_date
  FROM animal_visits
  WHERE course_id = p_course_id;
END;
$$;


ALTER FUNCTION "public"."get_course_progress"("p_course_id" "uuid") OWNER TO "postgres";

--
-- Name: FUNCTION "get_course_progress"("p_course_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."get_course_progress"("p_course_id" "uuid") IS 'Returns progress statistics for a treatment course';


--
-- Name: get_scheduled_medications_for_visit("uuid", "date"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_scheduled_medications_for_visit"("p_course_id" "uuid", "p_visit_date" "date") RETURNS TABLE("schedule_id" "uuid", "product_id" "uuid", "product_name" "text", "batch_id" "uuid", "unit" "text", "teat" "text", "purpose" "text", "notes" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    cms.id,
    cms.product_id,
    p.name,
    cms.batch_id,
    cms.unit,
    cms.teat,
    cms.purpose,
    cms.notes
  FROM course_medication_schedules cms
  JOIN products p ON cms.product_id = p.id
  WHERE cms.course_id = p_course_id
    AND cms.scheduled_date = p_visit_date
  ORDER BY p.name;
END;
$$;


ALTER FUNCTION "public"."get_scheduled_medications_for_visit"("p_course_id" "uuid", "p_visit_date" "date") OWNER TO "postgres";

--
-- Name: FUNCTION "get_scheduled_medications_for_visit"("p_course_id" "uuid", "p_visit_date" "date"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."get_scheduled_medications_for_visit"("p_course_id" "uuid", "p_visit_date" "date") IS 'Returns all medications scheduled for a specific visit date in a course';


--
-- Name: get_setting("text", numeric); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_setting"("key" "text", "default_value" numeric DEFAULT 0) RETURNS numeric
    LANGUAGE "sql" STABLE
    AS $$
  SELECT COALESCE(
    (SELECT setting_value::numeric FROM system_settings WHERE setting_key = key),
    default_value
  );
$$;


ALTER FUNCTION "public"."get_setting"("key" "text", "default_value" numeric) OWNER TO "postgres";

--
-- Name: FUNCTION "get_setting"("key" "text", "default_value" numeric); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."get_setting"("key" "text", "default_value" numeric) IS 'Helper function to retrieve system setting values with defaults';


--
-- Name: get_user_audit_logs("uuid", integer, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_user_audit_logs"("p_user_id" "uuid" DEFAULT NULL::"uuid", "p_limit" integer DEFAULT 100, "p_offset" integer DEFAULT 0) RETURNS TABLE("id" "uuid", "user_id" "uuid", "user_email" "text", "user_name" "text", "action" "text", "table_name" "text", "record_id" "uuid", "old_data" "jsonb", "new_data" "jsonb", "ip_address" "text", "user_agent" "text", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    al.id,
    al.user_id,
    u.email as user_email,
    u.full_name as user_name,
    al.action,
    al.table_name,
    al.record_id,
    al.old_data,
    al.new_data,
    al.ip_address,
    al.user_agent,
    al.created_at
  FROM public.user_audit_logs al
  LEFT JOIN public.users u ON u.id = al.user_id
  WHERE (p_user_id IS NULL OR al.user_id = p_user_id)
  ORDER BY al.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;


ALTER FUNCTION "public"."get_user_audit_logs"("p_user_id" "uuid", "p_limit" integer, "p_offset" integer) OWNER TO "postgres";

--
-- Name: get_user_role("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_user_role"("user_uuid" "uuid") RETURNS "text"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
SELECT role FROM public.user_profiles WHERE user_id = user_uuid;
$$;


ALTER FUNCTION "public"."get_user_role"("user_uuid" "uuid") OWNER TO "postgres";

--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
user_count integer;
BEGIN
-- Count existing users
SELECT COUNT(*) INTO user_count FROM public.user_profiles;

-- If this is the first user, make them admin, otherwise default to viewer
INSERT INTO public.user_profiles (user_id, role)
VALUES (
NEW.id,
CASE WHEN user_count = 0 THEN 'admin' ELSE 'viewer' END
);

RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";

--
-- Name: handle_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
NEW.updated_at = now();
RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_updated_at"() OWNER TO "postgres";

--
-- Name: handle_vehicle_visit_part_stock(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."handle_vehicle_visit_part_stock"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_batch_qty_left numeric;
  v_product_name text;
BEGIN
  SELECT b.qty_left, p.name INTO v_batch_qty_left, v_product_name
  FROM batches b
  JOIN products p ON p.id = b.product_id
  WHERE b.id = NEW.batch_id;

  IF v_batch_qty_left IS NULL THEN
    RAISE EXCEPTION 'Partija nerasta';
  END IF;

  IF v_batch_qty_left < NEW.quantity_used THEN
    RAISE EXCEPTION 'Nepakankamos atsargos produktui "%". Reikalinga: %, Turima: %',
      v_product_name, NEW.quantity_used, v_batch_qty_left;
  END IF;

  UPDATE batches
  SET qty_left = qty_left - NEW.quantity_used
  WHERE id = NEW.batch_id;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_vehicle_visit_part_stock"() OWNER TO "postgres";

--
-- Name: import_milk_data("jsonb"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."import_milk_data"("p_scraped_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_session_id uuid;
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
  -- Validate input format
  IF p_scraped_data->>'results' IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid data format. Expected "results" object.'
    );
  END IF;

  -- Create scrape session
  BEGIN
    INSERT INTO milk_scrape_sessions (
      scraped_at,
      url,
      date_from,
      date_to
    ) VALUES (
      (p_scraped_data->>'scraped_at')::timestamptz,
      p_scraped_data->>'url',
      parse_milk_date(p_scraped_data->'range'->>'from'),
      parse_milk_date(p_scraped_data->'range'->>'to')
    )
    RETURNING id INTO v_session_id;
  EXCEPTION
    WHEN OTHERS THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Failed to create scrape session: ' || SQLERRM
      );
  END;

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
              scrape_session_id,
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
              v_session_id,
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
              scrape_session_id = EXCLUDED.scrape_session_id,
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
              scrape_session_id,
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
              v_session_id,
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
              scrape_session_id = EXCLUDED.scrape_session_id,
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

  -- Build result
  v_result := jsonb_build_object(
    'success', true,
    'session_id', v_session_id,
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
$$;


ALTER FUNCTION "public"."import_milk_data"("p_scraped_data" "jsonb") OWNER TO "postgres";

--
-- Name: FUNCTION "import_milk_data"("p_scraped_data" "jsonb"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."import_milk_data"("p_scraped_data" "jsonb") IS 'Imports scraped milk test data without authentication requirement.';


--
-- Name: initialize_animal_synchronization("uuid", "uuid", "date"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."initialize_animal_synchronization"("p_animal_id" "uuid", "p_protocol_id" "uuid", "p_start_date" "date") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_sync_id uuid;
  v_protocol_steps jsonb;
  v_step jsonb;
BEGIN
  INSERT INTO public.animal_synchronizations (animal_id, protocol_id, start_date, status)
  VALUES (p_animal_id, p_protocol_id, p_start_date, 'Active')
  RETURNING id INTO v_sync_id;

  SELECT steps INTO v_protocol_steps
  FROM public.synchronization_protocols
  WHERE id = p_protocol_id;

  FOR v_step IN SELECT * FROM jsonb_array_elements(v_protocol_steps)
  LOOP
    INSERT INTO public.synchronization_steps (
      synchronization_id,
      step_number,
      step_name,
      scheduled_date,
      is_evening
    ) VALUES (
      v_sync_id,
      (v_step->>'step')::integer,
      v_step->>'medication',
      p_start_date + (v_step->>'day_offset')::integer,
      COALESCE((v_step->>'is_evening')::boolean, false)
    );
  END LOOP;

  RETURN v_sync_id;
END;
$$;


ALTER FUNCTION "public"."initialize_animal_synchronization"("p_animal_id" "uuid", "p_protocol_id" "uuid", "p_start_date" "date") OWNER TO "postgres";

--
-- Name: initialize_batch_fields(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."initialize_batch_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Set qty_left from received_qty if not already set
  IF NEW.qty_left IS NULL AND NEW.received_qty IS NOT NULL THEN
    NEW.qty_left := NEW.received_qty;
  END IF;

  -- Generate batch_number if not provided
  IF NEW.batch_number IS NULL THEN
    NEW.batch_number := COALESCE(
      NULLIF(NEW.lot, ''),
      'B-' || TO_CHAR(COALESCE(NEW.doc_date, CURRENT_DATE), 'YYYYMMDD') || '-' || SUBSTRING(NEW.id::text, 1, 8)
    );
  END IF;

  -- Set status to active if not provided
  IF NEW.status IS NULL THEN
    NEW.status := 'active';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."initialize_batch_fields"() OWNER TO "postgres";

--
-- Name: FUNCTION "initialize_batch_fields"(); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."initialize_batch_fields"() IS 'Automatically initializes batch fields (qty_left, batch_number, status) when a new batch is created';


--
-- Name: is_admin("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."is_admin"("user_uuid" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
SELECT EXISTS (
SELECT 1 FROM public.user_profiles
WHERE user_id = user_uuid AND role = 'admin'
);
$$;


ALTER FUNCTION "public"."is_admin"("user_uuid" "uuid") OWNER TO "postgres";

--
-- Name: is_user_frozen("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."is_user_frozen"("p_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  frozen boolean;
BEGIN
  SELECT is_frozen INTO frozen
  FROM public.users
  WHERE id = p_user_id;

  RETURN COALESCE(frozen, false);
END;
$$;


ALTER FUNCTION "public"."is_user_frozen"("p_user_id" "uuid") OWNER TO "postgres";

--
-- Name: link_medications_to_visit("uuid", "uuid", "date"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."link_medications_to_visit"("p_course_id" "uuid", "p_visit_id" "uuid", "p_visit_date" "date") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE course_medication_schedules
  SET visit_id = p_visit_id
  WHERE course_id = p_course_id
    AND scheduled_date = p_visit_date
    AND visit_id IS NULL;
END;
$$;


ALTER FUNCTION "public"."link_medications_to_visit"("p_course_id" "uuid", "p_visit_id" "uuid", "p_visit_date" "date") OWNER TO "postgres";

--
-- Name: FUNCTION "link_medications_to_visit"("p_course_id" "uuid", "p_visit_id" "uuid", "p_visit_date" "date"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."link_medications_to_visit"("p_course_id" "uuid", "p_visit_id" "uuid", "p_visit_date" "date") IS 'Links medication schedule entries to their corresponding visit when visit is created';


--
-- Name: link_past_milk_tests_to_weights(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."link_past_milk_tests_to_weights"() RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_composition_count integer := 0;
  v_quality_count integer := 0;
  v_result json;
BEGIN
  UPDATE milk_composition_tests
  SET milk_weight_id = subq.weight_id
  FROM (
    SELECT
      mct.id as test_id,
      mw.id as weight_id
    FROM milk_composition_tests mct
    INNER JOIN milk_producers mp ON mp.id = mct.producer_id
    INNER JOIN milk_weights mw ON mw.date = mct.paemimo_data AND mw.session_type = mp.label
    WHERE mct.milk_weight_id IS NULL
      AND mct.paemimo_data <= CURRENT_DATE
  ) subq
  WHERE milk_composition_tests.id = subq.test_id;

  GET DIAGNOSTICS v_composition_count = ROW_COUNT;

  UPDATE milk_quality_tests
  SET milk_weight_id = subq.weight_id
  FROM (
    SELECT
      mqt.id as test_id,
      mw.id as weight_id
    FROM milk_quality_tests mqt
    INNER JOIN milk_producers mp ON mp.id = mqt.producer_id
    INNER JOIN milk_weights mw ON mw.date = mqt.paemimo_data AND mw.session_type = mp.label
    WHERE mqt.milk_weight_id IS NULL
      AND mqt.paemimo_data <= CURRENT_DATE
  ) subq
  WHERE milk_quality_tests.id = subq.test_id;

  GET DIAGNOSTICS v_quality_count = ROW_COUNT;

  v_result := json_build_object(
    'success', true,
    'composition_tests_linked', v_composition_count,
    'quality_tests_linked', v_quality_count,
    'total_linked', v_composition_count + v_quality_count
  );

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM,
      'error_detail', SQLSTATE
    );
END;
$$;


ALTER FUNCTION "public"."link_past_milk_tests_to_weights"() OWNER TO "postgres";

--
-- Name: FUNCTION "link_past_milk_tests_to_weights"(); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."link_past_milk_tests_to_weights"() IS 'Links past milk test records to milk weights by matching date and session type. Only processes past dates.';


--
-- Name: log_user_action("uuid", "text", "text", "uuid", "jsonb", "jsonb", "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."log_user_action"("p_user_id" "uuid", "p_action" "text", "p_table_name" "text" DEFAULT NULL::"text", "p_record_id" "uuid" DEFAULT NULL::"uuid", "p_old_data" "jsonb" DEFAULT NULL::"jsonb", "p_new_data" "jsonb" DEFAULT NULL::"jsonb", "p_ip_address" "text" DEFAULT NULL::"text", "p_user_agent" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  log_id uuid;
BEGIN
  INSERT INTO public.user_audit_logs (
    user_id,
    action,
    table_name,
    record_id,
    old_data,
    new_data,
    ip_address,
    user_agent
  )
  VALUES (
    p_user_id,
    p_action,
    p_table_name,
    p_record_id,
    p_old_data,
    p_new_data,
    p_ip_address,
    p_user_agent
  )
  RETURNING id INTO log_id;

  RETURN log_id;
END;
$$;


ALTER FUNCTION "public"."log_user_action"("p_user_id" "uuid", "p_action" "text", "p_table_name" "text", "p_record_id" "uuid", "p_old_data" "jsonb", "p_new_data" "jsonb", "p_ip_address" "text", "p_user_agent" "text") OWNER TO "postgres";

--
-- Name: lookup_bom("text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."lookup_bom"("comp" "text") RETURNS numeric
    LANGUAGE "sql" STABLE
    AS $$
  select unit_price_eur from bom_demo where component = comp;
$$;


ALTER FUNCTION "public"."lookup_bom"("comp" "text") OWNER TO "postgres";

--
-- Name: on_gea_daily_status_change(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."on_gea_daily_status_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_cancelled_count INTEGER;
  v_old_status TEXT;
  v_new_status TEXT;
BEGIN
  -- Normalize status values (trim whitespace, handle nulls)
  v_old_status := TRIM(COALESCE(OLD.statusas, ''));
  v_new_status := TRIM(COALESCE(NEW.statusas, ''));

  -- CRITICAL FIX: Only trigger when status is TRANSITIONING TO 'APSĖK'
  -- Must satisfy ALL conditions:
  -- 1. New status is exactly 'APSĖK'
  -- 2. Either it's a new INSERT with 'APSĖK', OR
  -- 3. It's an UPDATE where old status was NOT 'APSĖK' (actual transition)
  IF v_new_status = 'APSĖK' AND
     (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND v_old_status != 'APSĖK')) THEN

    RAISE NOTICE 'Auto-cancelling synchronizations for animal % - status transitioning to APSĖK (was: %)',
      NEW.animal_id, v_old_status;

    -- Cancel all active synchronization protocols for this animal
    v_cancelled_count := cancel_animal_synchronization_protocols(NEW.animal_id);

    IF v_cancelled_count > 0 THEN
      RAISE NOTICE 'Successfully cancelled % synchronization protocol(s)', v_cancelled_count;
    END IF;

  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."on_gea_daily_status_change"() OWNER TO "postgres";

--
-- Name: FUNCTION "on_gea_daily_status_change"(); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."on_gea_daily_status_change"() IS 'Triggers auto-cancellation of synchronization protocols when animal status transitions TO APSĖK.
FIXED: Now only fires on actual status change to APSĖK, not on every row update.';


--
-- Name: parse_milk_date("text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."parse_milk_date"("date_str" "text") RETURNS "date"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $_$
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
$_$;


ALTER FUNCTION "public"."parse_milk_date"("date_str" "text") OWNER TO "postgres";

--
-- Name: FUNCTION "parse_milk_date"("date_str" "text"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."parse_milk_date"("date_str" "text") IS 'Helper function to parse various date formats used in milk test data (YYYYMMDD, YY.MM.DD, YYYY.MM.DD)';


--
-- Name: process_visit_medications(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."process_visit_medications"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
v_medication jsonb;
v_treatment_id uuid;
v_product record;
v_unit_value text;
v_requested_qty decimal;
v_remaining_qty decimal;
v_batch record;
v_batch_qty decimal;
v_total_available decimal;
BEGIN
-- Only process if status is changing TO "Baigtas" and medications haven't been processed yet
IF NEW.status = 'Baigtas'
AND (OLD.status IS NULL OR OLD.status != 'Baigtas')
AND NEW.planned_medications IS NOT NULL
AND NOT COALESCE(NEW.medications_processed, false) THEN

RAISE NOTICE 'Processing medications for visit %', NEW.id;

-- Get the treatment_id for this visit (if exists)
SELECT id INTO v_treatment_id
FROM treatments
WHERE visit_id = NEW.id
LIMIT 1;

-- If no treatment exists yet and this visit requires treatment, create one
IF v_treatment_id IS NULL AND NEW.treatment_required THEN
INSERT INTO treatments (
animal_id,
visit_id,
reg_date,
vet_name,
notes
) VALUES (
NEW.animal_id,
NEW.id,
DATE(NEW.visit_datetime),
NEW.vet_name,
'Auto-created from course visit completion'
)
RETURNING id INTO v_treatment_id;

RAISE NOTICE 'Created treatment record %', v_treatment_id;
END IF;

-- Process each planned medication
FOR v_medication IN SELECT * FROM jsonb_array_elements(NEW.planned_medications)
LOOP
RAISE NOTICE 'Processing medication: %', v_medication;

-- Get product details for unit conversion if needed
SELECT * INTO v_product
FROM products
WHERE id = (v_medication->>'product_id')::uuid;

-- Extract unit value with proper default
v_unit_value := COALESCE(v_medication->>'unit', 'ml');

-- Validate unit value is not empty
IF v_unit_value IS NULL OR v_unit_value = '' THEN
v_unit_value := 'ml';
END IF;

-- Get requested quantity
v_requested_qty := (v_medication->>'qty')::decimal;
v_remaining_qty := v_requested_qty;

IF v_treatment_id IS NOT NULL AND v_requested_qty > 0 THEN
-- Check total available stock
SELECT COALESCE(SUM(qty_left), 0) INTO v_total_available
FROM batches
WHERE product_id = (v_medication->>'product_id')::uuid
AND qty_left > 0;

IF v_total_available < v_requested_qty THEN
RAISE EXCEPTION 'Insufficient stock for product %. Requested: %, Available: %',
v_product.name, v_requested_qty, v_total_available;
END IF;

-- Loop through batches (FIFO - oldest expiry first) and deduct quantities
FOR v_batch IN
SELECT id, qty_left
FROM batches
WHERE product_id = (v_medication->>'product_id')::uuid
AND qty_left > 0
ORDER BY expiry_date ASC, created_at ASC
LOOP
-- Calculate how much to take from this batch
v_batch_qty := LEAST(v_batch.qty_left, v_remaining_qty);

BEGIN
-- Create usage_item for this batch portion
INSERT INTO usage_items (
treatment_id,
product_id,
batch_id,
qty,
unit,
purpose,
teat
) VALUES (
v_treatment_id,
(v_medication->>'product_id')::uuid,
v_batch.id,
v_batch_qty,
v_unit_value::unit,
COALESCE(v_medication->>'purpose', 'Gydymas'),
v_medication->>'teat'
);

RAISE NOTICE 'Created usage_item: Batch %, Qty: % %',
v_batch.id, v_batch_qty, v_unit_value;

-- Reduce remaining quantity needed
v_remaining_qty := v_remaining_qty - v_batch_qty;

-- Exit loop if we've allocated all requested quantity
IF v_remaining_qty <= 0 THEN
EXIT;
END IF;

EXCEPTION
WHEN OTHERS THEN
RAISE WARNING 'Failed to create usage_item for batch %. Error: %', v_batch.id, SQLERRM;
-- Continue with next batch
END;
END LOOP;

-- Final check that we allocated everything
IF v_remaining_qty > 0.001 THEN
RAISE WARNING 'Could not fully allocate medication. Remaining: % %', v_remaining_qty, v_unit_value;
END IF;
END IF;
END LOOP;

-- Mark medications as processed
NEW.medications_processed := true;

RAISE NOTICE 'Completed processing medications for visit %', NEW.id;
END IF;

RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."process_visit_medications"() OWNER TO "postgres";

--
-- Name: FUNCTION "process_visit_medications"(); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."process_visit_medications"() IS 'Automatically creates usage_items when visit status changes to Baigtas. Only processes medications with valid qty and batch_id values.';


--
-- Name: reset_planned_medication_quantities("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."reset_planned_medication_quantities"("p_visit_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_medications jsonb;
  v_med jsonb;
  v_updated_medications jsonb := '[]'::jsonb;
BEGIN
  -- Get current planned_medications
  SELECT planned_medications INTO v_medications
  FROM animal_visits
  WHERE id = p_visit_id;

  -- If no medications, nothing to do
  IF v_medications IS NULL THEN
    RETURN;
  END IF;

  -- Loop through each medication and reset qty to null
  FOR v_med IN SELECT * FROM jsonb_array_elements(v_medications)
  LOOP
    v_updated_medications := v_updated_medications || jsonb_build_object(
      'product_id', v_med->>'product_id',
      'batch_id', v_med->>'batch_id',
      'qty', null,
      'unit', v_med->>'unit',
      'purpose', v_med->>'purpose',
      'teat', v_med->>'teat'
    );
  END LOOP;

  -- Update the visit with reset quantities
  UPDATE animal_visits
  SET planned_medications = v_updated_medications,
      notes = COALESCE(notes || E'\n\n', '') || '[Sistema atnaujinta: įveskite faktinį vaistų kiekį prieš užbaigiant vizitą]'
  WHERE id = p_visit_id;

END;
$$;


ALTER FUNCTION "public"."reset_planned_medication_quantities"("p_visit_id" "uuid") OWNER TO "postgres";

--
-- Name: FUNCTION "reset_planned_medication_quantities"("p_visit_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."reset_planned_medication_quantities"("p_visit_id" "uuid") IS 'Resets qty values in planned_medications to null, requiring manual entry before visit completion';


--
-- Name: restore_equipment_stock(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."restore_equipment_stock"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
quantity_change numeric;
BEGIN
-- Calculate the change in returned quantity
quantity_change := NEW.quantity_returned - COALESCE(OLD.quantity_returned, 0);

-- Only process if there's actually a return
IF quantity_change > 0 THEN
-- Check if return exceeds issued amount
IF NEW.quantity_returned > NEW.quantity THEN
RAISE EXCEPTION 'Return quantity (%) cannot exceed issued quantity (%)', 
NEW.quantity_returned, NEW.quantity;
END IF;

-- Restore to batch
UPDATE equipment_batches
SET qty_left = qty_left + quantity_change
WHERE id = NEW.batch_id;

-- Log movement
INSERT INTO equipment_stock_movements (
batch_id, 
movement_type, 
quantity, 
reference_table, 
reference_id,
notes
) VALUES (
NEW.batch_id, 
'return', 
quantity_change, 
'equipment_issuance_items', 
NEW.id,
'Returned equipment'
);
END IF;

RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."restore_equipment_stock"() OWNER TO "postgres";

--
-- Name: restore_vehicle_visit_part_stock(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."restore_vehicle_visit_part_stock"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE batches
  SET qty_left = qty_left + OLD.quantity_used
  WHERE id = OLD.batch_id;
  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."restore_vehicle_visit_part_stock"() OWNER TO "postgres";

--
-- Name: safe_bool_lt("text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."safe_bool_lt"("p" "text") RETURNS boolean
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
declare s text;
begin
  s := lower(btrim(coalesce(p,'')));
  if s in ('taip','yes','true','1','y') then return true; end if;
  if s in ('ne','no','false','0','n') then return false; end if;
  return null;
end;
$$;


ALTER FUNCTION "public"."safe_bool_lt"("p" "text") OWNER TO "postgres";

--
-- Name: safe_date("text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."safe_date"("p" "text") RETURNS "date"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
declare d date;
begin
  if p is null then return null; end if;
  p := btrim(p);
  if p = '' then return null; end if;

  -- ISO first
  begin
    d := p::date;
    return d;
  exception when others then null;
  end;

  -- Common formats
  begin d := to_date(p, 'DD.MM.YYYY'); return d; exception when others then null; end;
  begin d := to_date(p, 'YYYY.MM.DD'); return d; exception when others then null; end;
  begin d := to_date(p, 'DD/MM/YYYY'); return d; exception when others then null; end;
  begin d := to_date(p, 'MM/DD/YYYY'); return d; exception when others then null; end;

  return null;
end;
$$;


ALTER FUNCTION "public"."safe_date"("p" "text") OWNER TO "postgres";

--
-- Name: safe_int("text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."safe_int"("p" "text") RETURNS integer
    LANGUAGE "plpgsql" IMMUTABLE
    AS $_$
declare s text;
begin
  if p is null then return null; end if;
  s := btrim(p);
  if s = '' then return null; end if;

  if s ~ '^\*+$' then return null; end if;
  if lower(s) in ('na','n/a','null','none','-') then return null; end if;

  s := regexp_replace(s, '[^0-9\-]', '', 'g');
  if s = '' or s = '-' then return null; end if;

  begin
    return s::int;
  exception when others then
    return null;
  end;
end;
$_$;


ALTER FUNCTION "public"."safe_int"("p" "text") OWNER TO "postgres";

--
-- Name: safe_numeric("text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."safe_numeric"("p" "text") RETURNS numeric
    LANGUAGE "plpgsql" IMMUTABLE
    AS $_$
declare s text;
begin
  if p is null then return null; end if;
  s := btrim(p);
  if s = '' then return null; end if;

  -- hard kill GEA placeholders like ****** (your exact bug)
  if s ~ '^\*+$' then return null; end if;
  if lower(s) in ('na','n/a','null','none','-') then return null; end if;

  -- allow comma decimals
  s := replace(s, ',', '.');

  -- keep digits, dot, minus
  s := regexp_replace(s, '[^0-9\.\-]', '', 'g');

  -- avoid edge cases
  if s = '' or s = '-' or s = '.' or s = '-.' then return null; end if;

  begin
    return s::numeric;
  exception when others then
    return null;
  end;
end;
$_$;


ALTER FUNCTION "public"."safe_numeric"("p" "text") OWNER TO "postgres";

--
-- Name: set_work_order_number_trigger(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."set_work_order_number_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.work_order_number IS NULL THEN
    NEW.work_order_number := generate_work_order_number();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_work_order_number_trigger"() OWNER TO "postgres";

--
-- Name: sync_animals("jsonb", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."sync_animals"("_rows" "jsonb", "_source" "text" DEFAULT 'vic_pdf'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_total_seen    int := 0;
  v_pre_existing  int := 0;
  v_inserted      int := 0;
  v_reactivated   int := 0;
  v_deactivated   int := 0;
  v_total_active  int := 0;
  v_updated       int := 0;
begin
  -- Temp payload for this run
  create temporary table tmp_animals_src (
    tag_no       text primary key,
    species      text,
    sex          text,
    breed        text,
    birth_date   text,  -- your schema uses text
    age_months   int,
    holder_name  text,
    holder_address text
  ) on commit drop;

  insert into tmp_animals_src(tag_no, species, sex, breed, birth_date, age_months, holder_name, holder_address)
  select
    trim(x->>'tag_no'),
    nullif(x->>'species',''),
    nullif(x->>'sex',''),
    nullif(x->>'breed',''),
    nullif(x->>'birth_date',''),                -- keep as text
    nullif(x->>'age_months','')::int,
    nullif(x->>'holder_name',''),
    nullif(x->>'holder_address','')
  from jsonb_array_elements(_rows) as x
  where (x->>'tag_no') is not null and btrim(x->>'tag_no') <> '';

  get diagnostics v_total_seen = row_count;

  -- How many already exist BEFORE upsert
  select count(*) into v_pre_existing
  from public.animals a
  join tmp_animals_src s on s.tag_no = a.tag_no;

  -- How many will be reactivated (were inactive before, now present)
  select count(*) into v_reactivated
  from public.animals a
  join tmp_animals_src s on s.tag_no = a.tag_no
  where coalesce(a.active,false) = false;

  -- UPSERT (patch semantics; do not overwrite with NULLs)
  insert into public.animals as a
    (tag_no, species, sex, age_months, holder_name, holder_address, breed, birth_date, active, source, updated_from_vic_at)
  select
    s.tag_no, s.species, s.sex, s.age_months, s.holder_name, s.holder_address, s.breed, s.birth_date, true, _source, now()
  from tmp_animals_src s
  on conflict (tag_no) do update
    set species              = coalesce(excluded.species, a.species),
        sex                  = coalesce(excluded.sex, a.sex),
        age_months           = coalesce(excluded.age_months, a.age_months),
        holder_name          = coalesce(excluded.holder_name, a.holder_name),
        holder_address       = coalesce(excluded.holder_address, a.holder_address),
        breed                = coalesce(excluded.breed, a.breed),
        birth_date           = coalesce(excluded.birth_date, a.birth_date),
        active               = true,
        source               = _source,
        updated_from_vic_at  = now();

  -- inserted = seen - pre_existing
  v_inserted := greatest(v_total_seen - v_pre_existing, 0);
  -- updated = existing - reactivated
  v_updated  := greatest(v_pre_existing - v_reactivated, 0);

  -- Deactivate animals from THIS source that were NOT seen this run
  update public.animals a
     set active = false
   where a.source = _source
     and a.active = true
     and not exists (select 1 from tmp_animals_src s where s.tag_no = a.tag_no);

  get diagnostics v_deactivated = row_count;

  select count(*) into v_total_active
  from public.animals
  where source = _source and active = true;

  return jsonb_build_object(
    'inserted',      v_inserted,
    'updated',       v_updated,
    'reactivated',   v_reactivated,
    'deactivated',   v_deactivated,
    'total_active',  v_total_active,
    'total_seen',    v_total_seen
  );
end
$$;


ALTER FUNCTION "public"."sync_animals"("_rows" "jsonb", "_source" "text") OWNER TO "postgres";

--
-- Name: sync_biocide_usage_to_stock(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."sync_biocide_usage_to_stock"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Only create usage_item if we have the required fields for stock tracking
  IF NEW.batch_id IS NOT NULL AND NEW.qty IS NOT NULL AND NEW.qty > 0 THEN

    -- Check if a matching usage_item already exists to prevent duplicates
    IF NOT EXISTS (
      SELECT 1 FROM usage_items
      WHERE biocide_usage_id = NEW.id
    ) THEN

      -- Insert into usage_items to track stock deduction
      INSERT INTO usage_items (
        treatment_id,
        vaccination_id,
        biocide_usage_id,
        product_id,
        batch_id,
        qty,
        unit,
        purpose,
        created_at
      ) VALUES (
        NULL,
        NULL,
        NEW.id,  -- Link to biocide_usage record
        NEW.product_id,
        NEW.batch_id,
        NEW.qty,
        NEW.unit::unit,
        COALESCE(NEW.purpose, 'Profilaktika'),
        NEW.created_at
      );

      RAISE NOTICE 'Created usage_item for prevention: biocide_usage_id=%, product_id=%, batch_id=%, qty=% %',
        NEW.id, NEW.product_id, NEW.batch_id, NEW.qty, NEW.unit;
    ELSE
      RAISE NOTICE 'Skipped duplicate usage_item for biocide_usage.id=%', NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_biocide_usage_to_stock"() OWNER TO "postgres";

--
-- Name: FUNCTION "sync_biocide_usage_to_stock"(); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."sync_biocide_usage_to_stock"() IS 'Automatically creates usage_items when prevention products (biocide_usage) are used. This ensures prevention products deduct from stock just like treatments and vaccinations.';


--
-- Name: touch_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  return new;
end$$;


ALTER FUNCTION "public"."touch_updated_at"() OWNER TO "postgres";

--
-- Name: trigger_calculate_withdrawal_on_usage(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."trigger_calculate_withdrawal_on_usage"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Call the withdrawal calculation function
  PERFORM calculate_withdrawal_dates(NEW.treatment_id);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_calculate_withdrawal_on_usage"() OWNER TO "postgres";

--
-- Name: trigger_set_timestamp(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."trigger_set_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_set_timestamp"() OWNER TO "postgres";

--
-- Name: unfreeze_user("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."unfreeze_user"("p_user_id" "uuid", "p_admin_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  admin_role text;
BEGIN
  -- Check if the admin has admin role
  SELECT role INTO admin_role
  FROM public.users
  WHERE id = p_admin_id;

  IF admin_role != 'admin' THEN
    RAISE EXCEPTION 'Only admins can unfreeze users';
  END IF;

  -- Unfreeze the user
  UPDATE public.users
  SET is_frozen = false,
      frozen_at = NULL,
      frozen_by = NULL,
      updated_at = now()
  WHERE id = p_user_id;

  -- Log the action
  PERFORM public.log_user_action(
    p_admin_id,
    'unfreeze_user',
    'users',
    p_user_id,
    jsonb_build_object('is_frozen', true),
    jsonb_build_object('is_frozen', false)
  );

  RETURN FOUND;
END;
$$;


ALTER FUNCTION "public"."unfreeze_user"("p_user_id" "uuid", "p_admin_id" "uuid") OWNER TO "postgres";

--
-- Name: update_batch_qty_left(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."update_batch_qty_left"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Deduct from batch stock
  UPDATE batches
  SET
    qty_left = qty_left - NEW.qty,
    status = CASE
      WHEN (qty_left - NEW.qty) <= 0 THEN 'depleted'
      ELSE status
    END,
    updated_at = NOW()
  WHERE id = NEW.batch_id;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_batch_qty_left"() OWNER TO "postgres";

--
-- Name: FUNCTION "update_batch_qty_left"(); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."update_batch_qty_left"() IS 'Automatically updates qty_left when usage_items are inserted';


--
-- Name: update_cost_accumulation_project_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."update_cost_accumulation_project_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_cost_accumulation_project_updated_at"() OWNER TO "postgres";

--
-- Name: update_cost_center_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."update_cost_center_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_cost_center_updated_at"() OWNER TO "postgres";

--
-- Name: update_farm_equipment_item_next_service_date(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."update_farm_equipment_item_next_service_date"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.next_service_date := calculate_next_service_date(
    NEW.last_service_date,
    NEW.service_interval_value,
    NEW.service_interval_type
  );
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_farm_equipment_item_next_service_date"() OWNER TO "postgres";

--
-- Name: update_fire_extinguishers_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."update_fire_extinguishers_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_fire_extinguishers_updated_at"() OWNER TO "postgres";

--
-- Name: update_hoof_records_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."update_hoof_records_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_hoof_records_updated_at"() OWNER TO "postgres";

--
-- Name: update_last_login("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."update_last_login"("p_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
UPDATE public.users
SET last_login = now()
WHERE id = p_user_id;

RETURN FOUND;
END;
$$;


ALTER FUNCTION "public"."update_last_login"("p_user_id" "uuid") OWNER TO "postgres";

--
-- Name: update_last_service_date_on_new_record(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."update_last_service_date_on_new_record"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE public.farm_equipment_items
  SET last_service_date = NEW.service_date
  WHERE id = NEW.farm_equipment_item_id
    AND (last_service_date IS NULL OR NEW.service_date > last_service_date);
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_last_service_date_on_new_record"() OWNER TO "postgres";

--
-- Name: update_schedule_on_work_order_complete(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."update_schedule_on_work_order_complete"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_schedule RECORD;
  v_vehicle_mileage numeric;
  v_vehicle_hours numeric;
BEGIN
  -- Handle INSERT (when work order is created as 'completed')
  IF TG_OP = 'INSERT' AND NEW.status = 'completed' AND NEW.schedule_id IS NOT NULL THEN
    -- Get the schedule details
    SELECT * INTO v_schedule
    FROM maintenance_schedules
    WHERE id = NEW.schedule_id;

    -- Get vehicle readings (prefer work order values, fallback to vehicle current values)
    SELECT 
      COALESCE(NEW.odometer_reading, current_mileage),
      COALESCE(NEW.engine_hours, current_engine_hours)
    INTO v_vehicle_mileage, v_vehicle_hours
    FROM vehicles
    WHERE id = v_schedule.vehicle_id;

    -- Update last_performed_date and calculate next_due_date
    UPDATE maintenance_schedules
    SET
      last_performed_date = COALESCE(NEW.completed_date::date, NEW.created_at::date, CURRENT_DATE),
      -- Calculate next_due_date based on interval_type
      -- Handle 0 or negative intervals by setting to 1 year from now
      next_due_date = CASE
        WHEN v_schedule.maintenance_type = 'date' AND v_schedule.interval_type = 'days' THEN
          CASE 
            WHEN v_schedule.interval_value <= 0 THEN
              (COALESCE(NEW.completed_date::date, NEW.created_at::date, CURRENT_DATE) + '1 year'::interval)::date
            ELSE
              (COALESCE(NEW.completed_date::date, NEW.created_at::date, CURRENT_DATE) + (v_schedule.interval_value || ' days')::interval)::date
          END
        WHEN v_schedule.maintenance_type = 'date' AND v_schedule.interval_type = 'months' THEN
          CASE 
            WHEN v_schedule.interval_value <= 0 THEN
              (COALESCE(NEW.completed_date::date, NEW.created_at::date, CURRENT_DATE) + '1 year'::interval)::date
            ELSE
              (COALESCE(NEW.completed_date::date, NEW.created_at::date, CURRENT_DATE) + (v_schedule.interval_value || ' months')::interval)::date
          END
        WHEN v_schedule.maintenance_type = 'date' AND v_schedule.interval_type = 'years' THEN
          CASE 
            WHEN v_schedule.interval_value <= 0 THEN
              (COALESCE(NEW.completed_date::date, NEW.created_at::date, CURRENT_DATE) + '1 year'::interval)::date
            ELSE
              (COALESCE(NEW.completed_date::date, NEW.created_at::date, CURRENT_DATE) + (v_schedule.interval_value || ' years')::interval)::date
          END
        ELSE
          v_schedule.next_due_date -- Keep existing for mileage/hours
      END,
      -- Update mileage if applicable
      last_performed_mileage = CASE
        WHEN v_schedule.maintenance_type = 'mileage' AND v_vehicle_mileage IS NOT NULL THEN
          v_vehicle_mileage
        ELSE v_schedule.last_performed_mileage
      END,
      next_due_mileage = CASE
        WHEN v_schedule.maintenance_type = 'mileage' AND v_vehicle_mileage IS NOT NULL THEN
          v_vehicle_mileage + v_schedule.interval_value
        ELSE v_schedule.next_due_mileage
      END,
      -- Update hours if applicable (FIXED: use current_engine_hours instead of current_hours)
      last_performed_hours = CASE
        WHEN v_schedule.maintenance_type = 'hours' AND v_vehicle_hours IS NOT NULL THEN
          v_vehicle_hours
        ELSE v_schedule.last_performed_hours
      END,
      next_due_hours = CASE
        WHEN v_schedule.maintenance_type = 'hours' AND v_vehicle_hours IS NOT NULL THEN
          v_vehicle_hours + v_schedule.interval_value
        ELSE v_schedule.next_due_hours
      END
    WHERE id = NEW.schedule_id;

    RETURN NEW;
  END IF;

  -- Handle UPDATE (when work order status changes to 'completed')
  IF TG_OP = 'UPDATE' AND NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') AND NEW.schedule_id IS NOT NULL THEN
    -- Get the schedule details
    SELECT * INTO v_schedule
    FROM maintenance_schedules
    WHERE id = NEW.schedule_id;

    -- Get vehicle readings (prefer work order values, fallback to vehicle current values)
    SELECT 
      COALESCE(NEW.odometer_reading, current_mileage),
      COALESCE(NEW.engine_hours, current_engine_hours)
    INTO v_vehicle_mileage, v_vehicle_hours
    FROM vehicles
    WHERE id = v_schedule.vehicle_id;

    -- Update last_performed_date and calculate next_due_date
    UPDATE maintenance_schedules
    SET
      last_performed_date = COALESCE(NEW.completed_date::date, CURRENT_DATE),
      -- Calculate next_due_date based on interval_type
      -- Handle 0 or negative intervals by setting to 1 year from now
      next_due_date = CASE
        WHEN v_schedule.maintenance_type = 'date' AND v_schedule.interval_type = 'days' THEN
          CASE 
            WHEN v_schedule.interval_value <= 0 THEN
              (COALESCE(NEW.completed_date::date, CURRENT_DATE) + '1 year'::interval)::date
            ELSE
              (COALESCE(NEW.completed_date::date, CURRENT_DATE) + (v_schedule.interval_value || ' days')::interval)::date
          END
        WHEN v_schedule.maintenance_type = 'date' AND v_schedule.interval_type = 'months' THEN
          CASE 
            WHEN v_schedule.interval_value <= 0 THEN
              (COALESCE(NEW.completed_date::date, CURRENT_DATE) + '1 year'::interval)::date
            ELSE
              (COALESCE(NEW.completed_date::date, CURRENT_DATE) + (v_schedule.interval_value || ' months')::interval)::date
          END
        WHEN v_schedule.maintenance_type = 'date' AND v_schedule.interval_type = 'years' THEN
          CASE 
            WHEN v_schedule.interval_value <= 0 THEN
              (COALESCE(NEW.completed_date::date, CURRENT_DATE) + '1 year'::interval)::date
            ELSE
              (COALESCE(NEW.completed_date::date, CURRENT_DATE) + (v_schedule.interval_value || ' years')::interval)::date
          END
        ELSE
          v_schedule.next_due_date -- Keep existing for mileage/hours
      END,
      -- Update mileage if applicable
      last_performed_mileage = CASE
        WHEN v_schedule.maintenance_type = 'mileage' AND v_vehicle_mileage IS NOT NULL THEN
          v_vehicle_mileage
        ELSE v_schedule.last_performed_mileage
      END,
      next_due_mileage = CASE
        WHEN v_schedule.maintenance_type = 'mileage' AND v_vehicle_mileage IS NOT NULL THEN
          v_vehicle_mileage + v_schedule.interval_value
        ELSE v_schedule.next_due_mileage
      END,
      -- Update hours if applicable (FIXED: use current_engine_hours instead of current_hours)
      last_performed_hours = CASE
        WHEN v_schedule.maintenance_type = 'hours' AND v_vehicle_hours IS NOT NULL THEN
          v_vehicle_hours
        ELSE v_schedule.last_performed_hours
      END,
      next_due_hours = CASE
        WHEN v_schedule.maintenance_type = 'hours' AND v_vehicle_hours IS NOT NULL THEN
          v_vehicle_hours + v_schedule.interval_value
        ELSE v_schedule.next_due_hours
      END
    WHERE id = NEW.schedule_id;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_schedule_on_work_order_complete"() OWNER TO "postgres";

--
-- Name: update_shared_notepad_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."update_shared_notepad_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_shared_notepad_updated_at"() OWNER TO "postgres";

--
-- Name: update_teat_status_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."update_teat_status_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_teat_status_updated_at"() OWNER TO "postgres";

--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

--
-- Name: update_user_password("uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."update_user_password"("p_user_id" "uuid", "p_password" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
UPDATE public.users
SET password_hash = crypt(p_password, gen_salt('bf')),
updated_at = now()
WHERE id = p_user_id;

RETURN FOUND;
END;
$$;


ALTER FUNCTION "public"."update_user_password"("p_user_id" "uuid", "p_password" "text") OWNER TO "postgres";

--
-- Name: update_vehicle_last_service(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."update_vehicle_last_service"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.status = 'Baigtas' AND (OLD.status IS NULL OR OLD.status != 'Baigtas') THEN
    UPDATE vehicles
    SET
      last_service_date = NEW.visit_datetime,
      last_service_mileage = COALESCE(NEW.odometer_reading, last_service_mileage),
      last_service_hours = COALESCE(NEW.engine_hours, last_service_hours)
    WHERE id = NEW.vehicle_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_vehicle_last_service"() OWNER TO "postgres";

--
-- Name: update_work_order_costs(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."update_work_order_costs"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE maintenance_work_orders
  SET
    parts_cost = COALESCE((SELECT SUM(total_price) FROM work_order_parts WHERE work_order_id = COALESCE(NEW.work_order_id, OLD.work_order_id)), 0),
    labor_cost = COALESCE((SELECT SUM(total_cost) FROM work_order_labor WHERE work_order_id = COALESCE(NEW.work_order_id, OLD.work_order_id)), 0)
  WHERE id = COALESCE(NEW.work_order_id, OLD.work_order_id);

  UPDATE maintenance_work_orders SET total_cost = parts_cost + labor_cost WHERE id = COALESCE(NEW.work_order_id, OLD.work_order_id);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_work_order_costs"() OWNER TO "postgres";

--
-- Name: upsert_animals_json("jsonb"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."upsert_animals_json"("payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_now               timestamptz := now();
  v_deactivate        boolean     := coalesce(
                                      (payload->>'_deactivate_missing')::boolean,
                                      (payload->>'deactivate_missing')::boolean,
                                      false
                                    );
  v_received_rows     int := 0;  -- raw array length
  v_distinct_tags     int := 0;  -- distinct non-empty tag_no in input
  v_skipped_no_tag    int := 0;  -- rows without usable tag_no
  v_inserted          int := 0;
  v_updated           int := 0;
  v_reactivated       int := 0;
  v_deactivated       int := 0;
begin
  /*
    1) Choose the array of input rows from several possible containers.
       Accept: _rows | rows | animals | data | (payload itself if it's an array)
  */
  with picked as (
    select
      coalesce(
        case when jsonb_typeof(payload->'_rows')   = 'array' then payload->'_rows'   end,
        case when jsonb_typeof(payload->'rows')    = 'array' then payload->'rows'    end,
        case when jsonb_typeof(payload->'animals') = 'array' then payload->'animals' end,
        case when jsonb_typeof(payload->'data')    = 'array' then payload->'data'    end,
        case when jsonb_typeof(payload)            = 'array' then payload            end,
        '[]'::jsonb
      ) as rows
  ),
  -- count raw rows
  cnt_raw as (
    select jsonb_array_length(rows) as c from picked
  ),
  src as (
    select elem, ord
    from picked, jsonb_array_elements(picked.rows) with ordinality as t(elem, ord)
  ),
  /*
    2) Normalize per row.
       - tag_no from "tag_no" or "karves nr"
       - safe numeric cast for age_months
       - keep birth_date as TEXT (as per your schema)
       - source fallback
  */
  norm as (
    select
      trim(both from coalesce(
        nullif(elem->>'tag_no',''),
        nullif(elem->>'karves nr','')         -- LT export alias
      ))                                                as tag_no,
      nullif(elem->>'species','')                       as species,
      nullif(elem->>'sex','')                           as sex,
      case
        when (elem->>'age_months') ~ '^\d+$' then (elem->>'age_months')::int
        else null
      end                                               as age_months,
      nullif(elem->>'breed','')                         as breed,
      nullif(elem->>'birth_date','')                    as birth_date,   -- TEXT in table
      coalesce(nullif(elem->>'source',''), 'vic_pdf')   as source,
      ord
    from src
  ),
  dedup as (
    -- keep latest occurrence per tag_no
    select distinct on (tag_no) *
    from norm
    where tag_no is not null and tag_no <> ''
    order by tag_no, ord desc
  ),
  prev as (
    select a.tag_no, a.active as prev_active
    from public.animals a
    join dedup d using (tag_no)
  ),
  upserted as (
    insert into public.animals(
      tag_no, species, sex, age_months, breed, birth_date, active, source, updated_from_vic_at
    )
    select
      d.tag_no, d.species, d.sex, d.age_months, d.breed, d.birth_date,
      true, d.source, v_now
    from dedup d
    on conflict (tag_no) do update set
      species             = coalesce(excluded.species, animals.species),
      sex                 = coalesce(excluded.sex, animals.sex),
      age_months          = coalesce(excluded.age_months, animals.age_months),
      breed               = coalesce(excluded.breed, animals.breed),
      birth_date          = coalesce(excluded.birth_date, animals.birth_date),
      source              = coalesce(excluded.source, animals.source),
      active              = true,
      updated_from_vic_at = v_now
    returning tag_no, (xmax = 0) as inserted
  )
  select
    (select c from cnt_raw),
    (select count(*) from dedup),
    (select greatest((select c from cnt_raw) - (select count(*) from dedup), 0)),
    coalesce(sum((u.inserted)::int), 0),
    coalesce(sum((not u.inserted)::int), 0),
    coalesce(sum(case when p.prev_active = false then 1 else 0 end), 0)
  into
    v_received_rows,
    v_distinct_tags,
    v_skipped_no_tag,
    v_inserted,
    v_updated,
    v_reactivated
  from upserted u
  left join prev p using (tag_no);

  /*
    3) Optional deactivate: anything active in animals not present in this feed.
  */
  if v_deactivate then
    with current_tags as (
      select tag_no from dedup
    )
    update public.animals a
       set active = false
     where a.active = true
       and not exists (select 1 from current_tags c where c.tag_no = a.tag_no);

    get diagnostics v_deactivated = row_count;
  end if;

  return jsonb_build_object(
    'received_rows',     v_received_rows,
    'distinct_tag_rows', v_distinct_tags,
    'skipped_no_tag',    v_skipped_no_tag,
    'inserted',          v_inserted,
    'updated',           v_updated,
    'reactivated',       v_reactivated,
    'deactivated',       v_deactivated
  );
end;
$_$;


ALTER FUNCTION "public"."upsert_animals_json"("payload" "jsonb") OWNER TO "postgres";

--
-- Name: upsert_animals_named("jsonb", boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."upsert_animals_named"("_rows" "jsonb", "_deactivate_missing" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_inserted int := 0;
  v_updated int := 0;
  v_activated int := 0;
  v_deactivated int := 0;
begin
  -- upsert + last-occurrence-wins dedupe
  with j as (
    select
      trim(both from elem->>'tag_no')              as tag_no,
      nullif(elem->>'species','')                  as species,
      nullif(elem->>'sex','')                      as sex,
      (elem->>'age_months')::int                   as age_months,
      nullif(elem->>'breed','')                    as breed,
      nullif(elem->>'birth_date','')               as birth_date,
      coalesce(nullif(elem->>'source',''),'vic_pdf') as source,
      ord
    from jsonb_array_elements(_rows) with ordinality as t(elem, ord)
  ),
  dedup as (
    select distinct on (tag_no) *
    from j
    where tag_no is not null and tag_no <> ''
    order by tag_no, ord desc
  ),
  prev as (
    select a.tag_no, a.active as prev_active
    from public.animals a
    join dedup d using (tag_no)
  ),
  upserted as (
    insert into public.animals (
      tag_no, species, sex, age_months, breed, birth_date, active, source, updated_from_vic_at
    )
    select
      d.tag_no, d.species, d.sex, d.age_months, d.breed, d.birth_date,
      true, d.source, now()
    from dedup d
    on conflict (tag_no) do update set
      species               = coalesce(excluded.species, animals.species),
      sex                   = coalesce(excluded.sex, animals.sex),
      age_months            = coalesce(excluded.age_months, animals.age_months),
      breed                 = coalesce(excluded.breed, animals.breed),
      birth_date            = coalesce(excluded.birth_date, animals.birth_date),
      source                = coalesce(excluded.source, animals.source),
      active                = true,
      updated_from_vic_at   = now()
    returning tag_no, (xmax = 0) as inserted
  )
  select
    coalesce(sum((u.inserted)::int), 0),
    coalesce(sum((not u.inserted)::int), 0),
    coalesce(sum(case when p.prev_active = false then 1 else 0 end), 0)
  into v_inserted, v_updated, v_activated
  from upserted u
  left join prev p using (tag_no);

  if _deactivate_missing then
    with j as (
      select trim(both from elem->>'tag_no') as tag_no
      from jsonb_array_elements(_rows) as t(elem)
      where elem ? 'tag_no'
    ),
    dedup as (
      select distinct tag_no from j where tag_no is not null and tag_no <> ''
    )
    update public.animals a
    set active = false
    where a.active = true
      and not exists (select 1 from dedup d where d.tag_no = a.tag_no);

    get diagnostics v_deactivated = row_count;
  end if;

  return jsonb_build_object(
    'inserted',     v_inserted,
    'updated',      v_updated,
    'reactivated',  v_activated,
    'deactivated',  v_deactivated,
    'input_count',
      (select count(*) from (
         select distinct on (trim(both from elem->>'tag_no'))
                trim(both from elem->>'tag_no')
         from jsonb_array_elements(_rows) with ordinality as t(elem, ord)
         where elem ? 'tag_no' and trim(both from elem->>'tag_no') <> ''
       ) s)
  );
end;
$$;


ALTER FUNCTION "public"."upsert_animals_named"("_rows" "jsonb", "_deactivate_missing" boolean) OWNER TO "postgres";

--
-- Name: upsert_gea_daily("jsonb"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."upsert_gea_daily"("payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_input           int := 0;
  v_seen            int := 0;
  v_inserted        int := 0;
  v_updated         int := 0;
  v_skipped_nomatch int := 0;
begin
  -- 1) Count input rows
  with src as (
    select elem
    from jsonb_array_elements(coalesce(payload->'rows','[]'::jsonb)) t(elem)
  ),
  norm as (
    select
      nullif(trim(coalesce(elem->>'tag_no', elem->>'karves nr')),'')         as tag_no,
      nullif(elem->>'kaklo nr','')::int                                      as collar_no,
      nullif(elem->>'statusas','')                                           as statusas,
      nullif(elem->>'grupe','')::int                                         as grupe,
      nullif(elem->>'pieno vidurkis','')::numeric                            as milk_avg,

      (elem->>'melzimo data')::date         as m1_date,
      (elem->>'melzimo laikas')::time       as m1_time,
      nullif(elem->>'pieno kiekis','')::numeric       as m1_qty,

      (elem->>'melzimo data_2')::date       as m2_date,
      (elem->>'melzimo laikas_2')::time     as m2_time,
      nullif(elem->>'pieno kiekis_2','')::numeric     as m2_qty,

      (elem->>'melzimo data_3')::date       as m3_date,
      (elem->>'melzimo laikas_3')::time     as m3_time,
      nullif(elem->>'pieno kiekis_3','')::numeric     as m3_qty,

      (elem->>'melzimo data_4')::date       as m4_date,
      (elem->>'melzimo laikas_4')::time     as m4_time,
      nullif(elem->>'pieno kiekis_4','')::numeric     as m4_qty,

      (elem->>'melzimo data_5')::date       as m5_date,
      (elem->>'melzimo laikas_5')::time     as m5_time,
      nullif(elem->>'pieno kiekis_5','')::numeric     as m5_qty,

      case
        when lower(coalesce(elem->>'dalyvauja pieno gamyboje','')) in ('true','1','taip','yes') then true
        when lower(coalesce(elem->>'dalyvauja pieno gamyboje','')) in ('false','0','ne','no')  then false
        else (elem->>'dalyvauja pieno gamyboje')::boolean
      end                                                               as in_milk,

      (elem->>'apsiversiavo')::date                                       as calved_on,
      nullif(elem->>'laktacijos dienos','')::int                          as lact_days,
      (elem->>'apseklinimo diena')::date                                  as inseminated_on,

      nullif(elem->>'liko iki apsiveršiavimo','')::int                    as liko_iki_apsiversiavimo,
      nullif(elem->>'veršingumas dienomis','')::int                       as versingumas_dienomis,
      nullif(elem->>'veislinė vertė','')                                  as veisline_verte_txt,

      /* NEW: AB column (string as-is) */
      nullif(coalesce(elem->>'kada versiuosis', elem->>'kada veršiuosis'),'') as kada_versiuosis
    from src
  )
  select count(*) into v_input from norm;

  -- 2) Upsert
  with src as (
    select elem
    from jsonb_array_elements(coalesce(payload->'rows','[]'::jsonb)) t(elem)
  ),
  norm as (
    select
      nullif(trim(coalesce(elem->>'tag_no', elem->>'karves nr')),'')         as tag_no,
      nullif(elem->>'kaklo nr','')::int                                      as collar_no,
      nullif(elem->>'statusas','')                                           as statusas,
      nullif(elem->>'grupe','')::int                                         as grupe,
      nullif(elem->>'pieno vidurkis','')::numeric                            as milk_avg,

      (elem->>'melzimo data')::date         as m1_date,
      (elem->>'melzimo laikas')::time       as m1_time,
      nullif(elem->>'pieno kiekis','')::numeric       as m1_qty,

      (elem->>'melzimo data_2')::date       as m2_date,
      (elem->>'melzimo laikas_2')::time     as m2_time,
      nullif(elem->>'pieno kiekis_2','')::numeric     as m2_qty,

      (elem->>'melzimo data_3')::date       as m3_date,
      (elem->>'melzimo laikas_3')::time     as m3_time,
      nullif(elem->>'pieno kiekis_3','')::numeric     as m3_qty,

      (elem->>'melzimo data_4')::date       as m4_date,
      (elem->>'melzimo laikas_4')::time     as m4_time,
      nullif(elem->>'pieno kiekis_4','')::numeric     as m4_qty,

      (elem->>'melzimo data_5')::date       as m5_date,
      (elem->>'melzimo laikas_5')::time     as m5_time,
      nullif(elem->>'pieno kiekis_5','')::numeric     as m5_qty,

      case
        when lower(coalesce(elem->>'dalyvauja pieno gamyboje','')) in ('true','1','taip','yes') then true
        when lower(coalesce(elem->>'dalyvauja pieno gamyboje','')) in ('false','0','ne','no')  then false
        else (elem->>'dalyvauja pieno gamyboje')::boolean
      end                                                               as in_milk,

      (elem->>'apsiversiavo')::date                                       as calved_on,
      nullif(elem->>'laktacijos dienos','')::int                          as lact_days,
      (elem->>'apseklinimo diena')::date                                  as inseminated_on,

      nullif(elem->>'liko iki apsiveršiavimo','')::int                    as liko_iki_apsiversiavimo,
      nullif(elem->>'veršingumas dienomis','')::int                       as versingumas_dienomis,
      nullif(elem->>'veislinė vertė','')                                  as veisline_verte_txt,
      nullif(coalesce(elem->>'kada versiuosis', elem->>'kada veršiuosis'),'') as kada_versiuosis
    from src
  ),
  ids as (
    select a.id as animal_id, n.*
    from norm n
    join public.animals a on a.tag_no = n.tag_no
    where n.tag_no is not null
  ),
  upserted as (
    insert into public.gea_daily (
      animal_id, tag_no, collar_no, statusas, grupe, milk_avg,
      m1_date, m1_time, m1_qty,
      m2_date, m2_time, m2_qty,
      m3_date, m3_time, m3_qty,
      m4_date, m4_time, m4_qty,
      m5_date, m5_time, m5_qty,
      in_milk, calved_on, lact_days, inseminated_on,
      snapshot_date, source,
      veisline_verte, liko_iki_apsiversiavimo, versingumas_dienomis,
      kada_versiuosis
    )
    select
      i.animal_id, i.tag_no, i.collar_no, i.statusas, i.grupe, i.milk_avg,
      i.m1_date, i.m1_time, i.m1_qty,
      i.m2_date, i.m2_time, i.m2_qty,
      i.m3_date, i.m3_time, i.m3_qty,
      i.m4_date, i.m4_time, i.m4_qty,
      i.m5_date, i.m5_time, i.m5_qty,
      i.in_milk, i.calved_on, i.lact_days, i.inseminated_on,
      coalesce(i.m1_date, i.m2_date, i.m3_date, i.m4_date, i.m5_date, current_date) as snapshot_date,
      'gea',
      i.veisline_verte_txt,
      i.liko_iki_apsiversiavimo,
      i.versingumas_dienomis,
      i.kada_versiuosis
    from ids i
    on conflict (animal_id, snapshot_date) do update set
      collar_no                 = excluded.collar_no,
      statusas                  = excluded.statusas,
      grupe                     = excluded.grupe,
      milk_avg                  = excluded.milk_avg,
      m1_date                   = excluded.m1_date,  m1_time = excluded.m1_time,  m1_qty = excluded.m1_qty,
      m2_date                   = excluded.m2_date,  m2_time = excluded.m2_time,  m2_qty = excluded.m2_qty,
      m3_date                   = excluded.m3_date,  m3_time = excluded.m3_time,  m3_qty = excluded.m3_qty,
      m4_date                   = excluded.m4_date,  m4_time = excluded.m4_time,  m4_qty = excluded.m4_qty,
      m5_date                   = excluded.m5_date,  m5_time = excluded.m5_time,  m5_qty = excluded.m5_qty,
      in_milk                   = excluded.in_milk,
      calved_on                 = excluded.calved_on,
      lact_days                 = excluded.lact_days,
      inseminated_on            = excluded.inseminated_on,
      source                    = excluded.source,
      veisline_verte            = excluded.veisline_verte,
      liko_iki_apsiversiavimo   = excluded.liko_iki_apsiversiavimo,
      versingumas_dienomis      = excluded.versingumas_dienomis,
      kada_versiuosis           = excluded.kada_versiuosis
    returning (xmax = 0) as inserted
  )
  select
    coalesce(sum(case when inserted then 1 else 0 end), 0)::int,
    coalesce(sum(case when not inserted then 1 else 0 end), 0)::int
  into v_inserted, v_updated
  from upserted;

  v_seen := v_inserted + v_updated;
  v_skipped_nomatch := greatest(v_input - v_seen, 0);

  return jsonb_build_object(
    'input_rows',        v_input,
    'matched_animals',   v_seen,
    'inserted',          v_inserted,
    'updated',           v_updated,
    'skipped_no_match',  v_skipped_nomatch
  );
end;
$$;


ALTER FUNCTION "public"."upsert_gea_daily"("payload" "jsonb") OWNER TO "postgres";

--
-- Name: upsert_milk_weight("jsonb"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."upsert_milk_weight"("p_payload" "jsonb") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_session_type text;
  v_date date;
  v_event_type text;
  v_weight integer;
  v_hose text;
  v_stable boolean;
  v_ts_local text;
  v_tz text;
  v_session_id text;
  v_measurement_timestamp timestamptz;
  v_result json;
BEGIN
  -- Extract values from nested JSON payload
  v_weight := (p_payload->'measurement'->>'weight')::integer;
  v_hose := p_payload->'status'->>'hose';
  v_stable := (p_payload->'status'->>'stable')::boolean;
  v_ts_local := p_payload->'measurement'->>'ts_local';
  v_tz := p_payload->'measurement'->>'tz';
  v_session_id := p_payload->>'session_id';
  v_event_type := p_payload->>'event';

  -- Parse the local timestamp and convert to UTC
  v_measurement_timestamp := (v_ts_local || ' ' || v_tz)::timestamptz;

  -- Determine session type
  v_session_type := determine_session_type(v_measurement_timestamp, v_tz);

  -- Extract date from measurement timestamp in local timezone
  v_date := (v_measurement_timestamp AT TIME ZONE v_tz)::date;

  -- Insert new event record
  INSERT INTO milk_weights (
    date,
    session_type,
    weight,
    session_id,
    measurement_timestamp,
    timezone,
    hose_status,
    stable_status,
    event_type,
    raw_data,
    created_at,
    updated_at
  ) VALUES (
    v_date,
    v_session_type,
    v_weight,
    v_session_id,
    v_measurement_timestamp,
    v_tz,
    v_hose,
    v_stable,
    v_event_type,
    p_payload,
    now(),
    now()
  );

  -- Return success
  v_result := json_build_object(
    'success', true,
    'date', v_date,
    'session_type', v_session_type,
    'event_type', v_event_type,
    'weight', v_weight
  );

  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."upsert_milk_weight"("p_payload" "jsonb") OWNER TO "postgres";

--
-- Name: FUNCTION "upsert_milk_weight"("p_payload" "jsonb"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."upsert_milk_weight"("p_payload" "jsonb") IS 'Upserts milk weight from webhook payload. Accepts nested JSON with measurement.weight, status.hose, status.stable, measurement.ts_local, measurement.tz.';


--
-- Name: upsert_milk_weight(integer, timestamp with time zone, "text", "text", "text", boolean, "jsonb"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."upsert_milk_weight"("p_weight" integer, "p_measurement_timestamp" timestamp with time zone, "p_timezone" "text", "p_session_id" "text", "p_hose_status" "text", "p_stable_status" boolean, "p_raw_data" "jsonb") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_session_type text;
  v_date date;
  v_event_type text;
  v_result json;
BEGIN
  -- Determine session type
  v_session_type := determine_session_type(p_measurement_timestamp, p_timezone);

  -- Extract date from measurement timestamp
  v_date := (p_measurement_timestamp AT TIME ZONE p_timezone)::date;

  -- Extract event type from raw data
  v_event_type := p_raw_data->>'event';

  -- Insert new event record (no longer upserting)
  INSERT INTO milk_weights (
    date,
    session_type,
    weight,
    session_id,
    measurement_timestamp,
    timezone,
    hose_status,
    stable_status,
    event_type,
    raw_data,
    created_at,
    updated_at
  ) VALUES (
    v_date,
    v_session_type,
    p_weight,
    p_session_id,
    p_measurement_timestamp,
    p_timezone,
    p_hose_status,
    p_stable_status,
    v_event_type,
    p_raw_data,
    now(),
    now()
  );

  -- Return success
  v_result := json_build_object(
    'success', true,
    'date', v_date,
    'session_type', v_session_type,
    'event_type', v_event_type,
    'weight', p_weight
  );

  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."upsert_milk_weight"("p_weight" integer, "p_measurement_timestamp" timestamp with time zone, "p_timezone" "text", "p_session_id" "text", "p_hose_status" "text", "p_stable_status" boolean, "p_raw_data" "jsonb") OWNER TO "postgres";

--
-- Name: validate_visit_medications("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."validate_visit_medications"("p_visit_id" "uuid") RETURNS TABLE("is_valid" boolean, "error_message" "text", "missing_quantities" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_planned_meds jsonb;
  v_med jsonb;
  v_missing_count integer := 0;
BEGIN
  SELECT planned_medications INTO v_planned_meds
  FROM animal_visits
  WHERE id = p_visit_id;

  IF v_planned_meds IS NULL OR jsonb_array_length(v_planned_meds) = 0 THEN
    RETURN QUERY SELECT true, NULL::text, 0;
    RETURN;
  END IF;

  FOR v_med IN SELECT * FROM jsonb_array_elements(v_planned_meds)
  LOOP
    IF v_med->>'qty' IS NULL OR v_med->>'qty' = '' OR v_med->>'qty' = '0' THEN
      v_missing_count := v_missing_count + 1;
    END IF;
  END LOOP;

  IF v_missing_count > 0 THEN
    RETURN QUERY SELECT
      false,
      'Prašome įvesti kiekius visiems vaistams (' || v_missing_count || ' trūksta)',
      v_missing_count;
  ELSE
    RETURN QUERY SELECT true, NULL::text, 0;
  END IF;
END;
$$;


ALTER FUNCTION "public"."validate_visit_medications"("p_visit_id" "uuid") OWNER TO "postgres";

--
-- Name: FUNCTION "validate_visit_medications"("p_visit_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."validate_visit_medications"("p_visit_id" "uuid") IS 'Validates that all planned medications have quantities entered before visit completion';


--
-- Name: verify_password("text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."verify_password"("p_email" "text", "p_password" "text") RETURNS TABLE("user_id" "uuid", "user_email" "text", "user_role" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
RETURN QUERY
SELECT u.id, u.email, u.role
FROM public.users u
WHERE u.email = p_email
AND u.password_hash = crypt(p_password, u.password_hash);
END;
$$;


ALTER FUNCTION "public"."verify_password"("p_email" "text", "p_password" "text") OWNER TO "postgres";

--
-- Name: visit_needs_medication_entry("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."visit_needs_medication_entry"("p_visit_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_needs_entry boolean := false;
  v_medications jsonb;
  v_med jsonb;
BEGIN
  -- Get planned_medications for the visit
  SELECT planned_medications INTO v_medications
  FROM animal_visits
  WHERE id = p_visit_id
    AND status != 'Baigtas'
    AND medications_processed = false;

  -- If no medications, no entry needed
  IF v_medications IS NULL THEN
    RETURN false;
  END IF;

  -- Check if any medication has null qty
  FOR v_med IN SELECT * FROM jsonb_array_elements(v_medications)
  LOOP
    IF v_med->>'qty' IS NULL OR v_med->>'qty' = '' OR v_med->>'qty' = '0' THEN
      v_needs_entry := true;
      EXIT;
    END IF;
  END LOOP;

  RETURN v_needs_entry;
END;
$$;


ALTER FUNCTION "public"."visit_needs_medication_entry"("p_visit_id" "uuid") OWNER TO "postgres";

--
-- Name: FUNCTION "visit_needs_medication_entry"("p_visit_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."visit_needs_medication_entry"("p_visit_id" "uuid") IS 'Returns true if a visit has planned_medications with null quantities that need to be entered';


SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: animal_synchronizations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."animal_synchronizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "animal_id" "uuid" NOT NULL,
    "protocol_id" "uuid" NOT NULL,
    "start_date" "date" NOT NULL,
    "status" "text" DEFAULT 'Active'::"text" NOT NULL,
    "insemination_date" "date",
    "insemination_number" "text",
    "result" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "animal_synchronizations_status_check" CHECK (("status" = ANY (ARRAY['Active'::"text", 'Completed'::"text", 'Cancelled'::"text"])))
);


ALTER TABLE "public"."animal_synchronizations" OWNER TO "postgres";

--
-- Name: animals; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."animals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tag_no" "text",
    "species" "text" DEFAULT 'bovine'::"text",
    "sex" "text",
    "age_months" integer,
    "holder_name" "text",
    "holder_address" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "breed" "text",
    "birth_date" "text",
    "active" boolean DEFAULT true NOT NULL,
    "updated_from_vic_at" timestamp with time zone,
    "source" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."animals" OWNER TO "postgres";

--
-- Name: synchronization_protocols; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."synchronization_protocols" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "steps" "jsonb" NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."synchronization_protocols" OWNER TO "postgres";

--
-- Name: animal_milk_loss_by_synchronization; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."animal_milk_loss_by_synchronization" AS
 SELECT "a"."id" AS "animal_id",
    "a"."tag_no" AS "animal_number",
    NULL::"text" AS "animal_name",
    "s"."id" AS "sync_id",
    "s"."start_date" AS "sync_start",
    "s"."status" AS "sync_status",
    "s"."protocol_id",
    "sp"."name" AS "protocol_name",
    "ml"."sync_end_date" AS "sync_end",
    "ml"."total_days" AS "loss_days",
    "ml"."avg_daily_milk" AS "avg_daily_milk_kg",
    "ml"."total_milk_lost" AS "total_milk_lost_kg",
    "ml"."milk_loss_value" AS "milk_loss_value_eur",
    "ml"."milk_price_per_kg" AS "milk_price_used"
   FROM ((("public"."animals" "a"
     JOIN "public"."animal_synchronizations" "s" ON (("s"."animal_id" = "a"."id")))
     LEFT JOIN "public"."synchronization_protocols" "sp" ON (("sp"."id" = "s"."protocol_id")))
     CROSS JOIN LATERAL "public"."calculate_milk_loss_for_synchronization"("a"."id", "s"."id") "ml"("total_days", "avg_daily_milk", "total_milk_lost", "milk_loss_value", "milk_price_per_kg", "sync_start_date", "sync_end_date"))
  WHERE (("s"."status" = ANY (ARRAY['Active'::"text", 'Completed'::"text"])) AND ("ml"."total_days" > 0))
  ORDER BY "s"."start_date" DESC, "a"."tag_no";


ALTER VIEW "public"."animal_milk_loss_by_synchronization" OWNER TO "postgres";

--
-- Name: VIEW "animal_milk_loss_by_synchronization"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON VIEW "public"."animal_milk_loss_by_synchronization" IS 'Aggregates milk loss data by animal and synchronization, calculating financial impact based on synchronization periods and historical milk production data';


--
-- Name: animal_visits; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."animal_visits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "animal_id" "uuid" NOT NULL,
    "visit_datetime" timestamp with time zone NOT NULL,
    "procedures" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "temperature" numeric(4,1),
    "temperature_measured_at" timestamp with time zone,
    "status" "text" DEFAULT 'Planuojamas'::"text" NOT NULL,
    "notes" "text",
    "vet_name" "text",
    "next_visit_required" boolean DEFAULT false,
    "next_visit_date" timestamp with time zone,
    "treatment_required" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "related_treatment_id" "uuid",
    "planned_medications" "jsonb",
    "medications_processed" boolean DEFAULT false,
    "related_visit_id" "uuid",
    "sync_step_id" "uuid",
    "course_id" "uuid",
    CONSTRAINT "animal_visits_status_check" CHECK (("status" = ANY (ARRAY['Planuojamas'::"text", 'Vykdomas'::"text", 'Baigtas'::"text", 'Atšauktas'::"text", 'Neįvykęs'::"text"])))
);


ALTER TABLE "public"."animal_visits" OWNER TO "postgres";

--
-- Name: COLUMN "animal_visits"."planned_medications"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."animal_visits"."planned_medications" IS 'JSONB array of medications planned for this visit. Each entry: {product_id, batch_id, qty, unit, purpose, teat}';


--
-- Name: COLUMN "animal_visits"."medications_processed"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."animal_visits"."medications_processed" IS 'Whether planned medications have been deducted from inventory';


--
-- Name: COLUMN "animal_visits"."related_visit_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."animal_visits"."related_visit_id" IS 'Links to the original visit for course treatments';


--
-- Name: COLUMN "animal_visits"."course_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."animal_visits"."course_id" IS 'Links visit to its parent treatment course';


--
-- Name: animal_visit_summary; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."animal_visit_summary" AS
 SELECT "id" AS "animal_id",
    "tag_no",
    "species",
    ( SELECT "av"."visit_datetime"
           FROM "public"."animal_visits" "av"
          WHERE (("av"."animal_id" = "a"."id") AND ("av"."visit_datetime" > "now"()) AND ("av"."status" = ANY (ARRAY['Planuojamas'::"text", 'Vykdomas'::"text"])))
          ORDER BY "av"."visit_datetime"
         LIMIT 1) AS "next_visit",
    ( SELECT "av"."visit_datetime"
           FROM "public"."animal_visits" "av"
          WHERE (("av"."animal_id" = "a"."id") AND ("av"."visit_datetime" <= "now"()))
          ORDER BY "av"."visit_datetime" DESC
         LIMIT 1) AS "last_visit"
   FROM "public"."animals" "a";


ALTER VIEW "public"."animal_visit_summary" OWNER TO "postgres";

--
-- Name: batch_waste_tracking; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."batch_waste_tracking" (
    "batch_id" "uuid" NOT NULL,
    "medical_waste_id" "uuid" NOT NULL,
    "waste_generated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."batch_waste_tracking" OWNER TO "postgres";

--
-- Name: TABLE "batch_waste_tracking"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."batch_waste_tracking" IS 'Tracks which batches have already generated medical waste to prevent duplicates';


--
-- Name: batches; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."batches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "lot" "text",
    "mfg_date" "date",
    "expiry_date" "date",
    "supplier_id" "uuid",
    "doc_title" "text",
    "doc_number" "text",
    "doc_date" "date",
    "purchase_price" numeric(12,2),
    "currency" "text" DEFAULT 'EUR'::"text",
    "received_qty" numeric NOT NULL,
    "invoice_path" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "invoice_id" "uuid",
    "serial_number" "text",
    "package_size" numeric(10,2),
    "package_count" numeric(10,2),
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "qty_left" numeric(10,2),
    "batch_number" "text",
    "status" "text" DEFAULT 'active'::"text",
    CONSTRAINT "batches_received_qty_check" CHECK (("received_qty" >= (0)::numeric)),
    CONSTRAINT "batches_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'depleted'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."batches" OWNER TO "postgres";

--
-- Name: COLUMN "batches"."received_qty"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."batches"."received_qty" IS 'Total quantity calculated as package_size * package_count, or manually entered';


--
-- Name: COLUMN "batches"."package_size"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."batches"."package_size" IS 'Size of a single package unit (e.g., 1 bottle = 10ml, 1 box = 100 tablets)';


--
-- Name: COLUMN "batches"."package_count"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."batches"."package_count" IS 'Number of packages received (e.g., 6 bottles, 3 boxes)';


--
-- Name: COLUMN "batches"."qty_left"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."batches"."qty_left" IS 'Remaining quantity in this batch, automatically updated when usage_items are inserted';


--
-- Name: COLUMN "batches"."batch_number"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."batches"."batch_number" IS 'Human-readable batch identifier, generated from lot or created_at';


--
-- Name: COLUMN "batches"."status"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."batches"."status" IS 'Batch status: active, depleted, or expired';


--
-- Name: biocide_usage; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."biocide_usage" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "batch_id" "uuid",
    "use_date" "date" NOT NULL,
    "purpose" "text",
    "work_scope" "text",
    "qty" numeric NOT NULL,
    "unit" "public"."unit" NOT NULL,
    "used_by_name" "text",
    "user_signature_path" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "biocide_usage_qty_check" CHECK (("qty" > (0)::numeric))
);


ALTER TABLE "public"."biocide_usage" OWNER TO "postgres";

--
-- Name: cost_accumulation_documents; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."cost_accumulation_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_path" "text",
    "file_url" "text",
    "file_size" bigint,
    "mime_type" "text",
    "document_type" "text" DEFAULT 'invoice'::"text",
    "upload_date" timestamp with time zone DEFAULT "now"(),
    "uploaded_by" "uuid",
    "supplier_name" "text",
    "supplier_code" "text",
    "invoice_number" "text",
    "invoice_date" "date",
    "due_date" "date",
    "currency" "text" DEFAULT 'EUR'::"text",
    "total_net" numeric(15,2),
    "total_vat" numeric(15,2),
    "total_gross" numeric(15,2),
    "vat_rate" numeric(5,2),
    "webhook_response" "jsonb",
    "processing_status" "text" DEFAULT 'pending'::"text",
    "processing_error" "text",
    "processed_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "cost_accumulation_documents_document_type_check" CHECK (("document_type" = ANY (ARRAY['invoice'::"text", 'receipt'::"text", 'contract'::"text", 'estimate'::"text", 'other'::"text"]))),
    CONSTRAINT "cost_accumulation_documents_processing_status_check" CHECK (("processing_status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."cost_accumulation_documents" OWNER TO "postgres";

--
-- Name: cost_accumulation_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."cost_accumulation_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "document_id" "uuid",
    "line_no" integer,
    "sku" "text",
    "description" "text" NOT NULL,
    "quantity" numeric(15,3),
    "unit" "text",
    "unit_price" numeric(15,2),
    "net_amount" numeric(15,2),
    "vat_rate" numeric(5,2),
    "vat_amount" numeric(15,2),
    "gross_amount" numeric(15,2) NOT NULL,
    "category" "text",
    "batch_number" "text",
    "expiry_date" "date",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid"
);


ALTER TABLE "public"."cost_accumulation_items" OWNER TO "postgres";

--
-- Name: cost_accumulation_projects; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."cost_accumulation_projects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "start_date" "date",
    "end_date" "date",
    "status" "text" DEFAULT 'active'::"text",
    "budget_estimate" numeric(15,2),
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_active" boolean DEFAULT true,
    CONSTRAINT "cost_accumulation_projects_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'completed'::"text", 'on_hold'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."cost_accumulation_projects" OWNER TO "postgres";

--
-- Name: cost_accumulation_project_summary; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."cost_accumulation_project_summary" AS
 SELECT "p"."id",
    "p"."name",
    "p"."description",
    "p"."start_date",
    "p"."end_date",
    "p"."status",
    "p"."budget_estimate",
    "p"."notes",
    "p"."created_at",
    COALESCE("doc_stats"."total_documents", (0)::bigint) AS "total_documents",
    COALESCE("doc_stats"."processed_documents", (0)::bigint) AS "processed_documents",
    COALESCE("doc_stats"."failed_documents", (0)::bigint) AS "failed_documents",
    COALESCE("doc_stats"."total_net", (0)::numeric) AS "total_net",
    COALESCE("doc_stats"."total_vat", (0)::numeric) AS "total_vat",
    COALESCE("doc_stats"."total_gross", (0)::numeric) AS "total_gross",
    COALESCE("item_stats"."items_total_net", (0)::numeric) AS "items_total_net",
    COALESCE("item_stats"."items_total_vat", (0)::numeric) AS "items_total_vat",
    COALESCE("item_stats"."items_total_gross", (0)::numeric) AS "items_total_gross",
    COALESCE("item_stats"."total_items", (0)::bigint) AS "total_items",
        CASE
            WHEN (("p"."budget_estimate" IS NOT NULL) AND ("p"."budget_estimate" > (0)::numeric)) THEN ((COALESCE("doc_stats"."total_gross", (0)::numeric) / "p"."budget_estimate") * (100)::numeric)
            ELSE NULL::numeric
        END AS "budget_used_percentage",
        CASE
            WHEN ("p"."budget_estimate" IS NOT NULL) THEN ("p"."budget_estimate" - COALESCE("doc_stats"."total_gross", (0)::numeric))
            ELSE NULL::numeric
        END AS "budget_remaining"
   FROM (("public"."cost_accumulation_projects" "p"
     LEFT JOIN ( SELECT "cost_accumulation_documents"."project_id",
            "count"(*) AS "total_documents",
            "count"(*) FILTER (WHERE ("cost_accumulation_documents"."processing_status" = 'completed'::"text")) AS "processed_documents",
            "count"(*) FILTER (WHERE ("cost_accumulation_documents"."processing_status" = 'failed'::"text")) AS "failed_documents",
            "sum"("cost_accumulation_documents"."total_net") AS "total_net",
            "sum"("cost_accumulation_documents"."total_vat") AS "total_vat",
            "sum"("cost_accumulation_documents"."total_gross") AS "total_gross"
           FROM "public"."cost_accumulation_documents"
          GROUP BY "cost_accumulation_documents"."project_id") "doc_stats" ON (("p"."id" = "doc_stats"."project_id")))
     LEFT JOIN ( SELECT "cost_accumulation_items"."project_id",
            "count"(*) AS "total_items",
            "sum"("cost_accumulation_items"."net_amount") AS "items_total_net",
            "sum"("cost_accumulation_items"."vat_amount") AS "items_total_vat",
            "sum"("cost_accumulation_items"."gross_amount") AS "items_total_gross"
           FROM "public"."cost_accumulation_items"
          GROUP BY "cost_accumulation_items"."project_id") "item_stats" ON (("p"."id" = "item_stats"."project_id")))
  WHERE ("p"."is_active" = true);


ALTER VIEW "public"."cost_accumulation_project_summary" OWNER TO "postgres";

--
-- Name: cost_centers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."cost_centers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "color" "text" DEFAULT '#3B82F6'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "parent_id" "uuid"
);


ALTER TABLE "public"."cost_centers" OWNER TO "postgres";

--
-- Name: equipment_invoice_item_assignments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."equipment_invoice_item_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_item_id" "uuid" NOT NULL,
    "assignment_type" "text" NOT NULL,
    "vehicle_id" "uuid",
    "tool_id" "uuid",
    "notes" "text",
    "assigned_by" "uuid",
    "assigned_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cost_center_id" "uuid",
    CONSTRAINT "equipment_invoice_item_assignments_assignment_type_check" CHECK (("assignment_type" = ANY (ARRAY['vehicle'::"text", 'tool'::"text", 'building'::"text", 'general_farm'::"text", 'cost_center'::"text"])))
);


ALTER TABLE "public"."equipment_invoice_item_assignments" OWNER TO "postgres";

--
-- Name: equipment_invoice_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."equipment_invoice_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "uuid",
    "line_no" integer,
    "product_id" "uuid",
    "description" "text",
    "quantity" numeric NOT NULL,
    "unit_price" numeric NOT NULL,
    "total_price" numeric NOT NULL,
    "vat_rate" numeric DEFAULT 21,
    "batch_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."equipment_invoice_items" OWNER TO "postgres";

--
-- Name: equipment_invoices; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."equipment_invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_number" "text" NOT NULL,
    "invoice_date" "date" NOT NULL,
    "supplier_id" "uuid",
    "supplier_name" "text",
    "total_net" numeric DEFAULT 0,
    "total_vat" numeric DEFAULT 0,
    "total_gross" numeric DEFAULT 0,
    "currency" "text" DEFAULT 'EUR'::"text",
    "status" "text" DEFAULT 'received'::"text",
    "pdf_url" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid"
);


ALTER TABLE "public"."equipment_invoices" OWNER TO "postgres";

--
-- Name: cost_center_direct_summary; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."cost_center_direct_summary" AS
 SELECT "cc"."id" AS "cost_center_id",
    "cc"."name" AS "cost_center_name",
    "cc"."description",
    "cc"."color",
    "cc"."parent_id",
    "cc"."is_active",
    "count"(DISTINCT "eia"."id") AS "direct_assignments",
    COALESCE("sum"("eii"."total_price"), (0)::numeric) AS "direct_cost",
    "min"("ei"."invoice_date") AS "first_assignment_date",
    "max"("ei"."invoice_date") AS "last_assignment_date"
   FROM ((("public"."cost_centers" "cc"
     LEFT JOIN "public"."equipment_invoice_item_assignments" "eia" ON ((("eia"."cost_center_id" = "cc"."id") AND ("eia"."assignment_type" = 'cost_center'::"text"))))
     LEFT JOIN "public"."equipment_invoice_items" "eii" ON (("eii"."id" = "eia"."invoice_item_id")))
     LEFT JOIN "public"."equipment_invoices" "ei" ON (("ei"."id" = "eii"."invoice_id")))
  WHERE ("cc"."is_active" = true)
  GROUP BY "cc"."id", "cc"."name", "cc"."description", "cc"."color", "cc"."parent_id", "cc"."is_active";


ALTER VIEW "public"."cost_center_direct_summary" OWNER TO "postgres";

--
-- Name: equipment_categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."equipment_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "parent_category_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."equipment_categories" OWNER TO "postgres";

--
-- Name: equipment_products; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."equipment_products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "category_id" "uuid",
    "product_code" "text",
    "unit_type" "text" DEFAULT 'pcs'::"text",
    "manufacturer" "text",
    "model_number" "text",
    "min_stock_level" numeric DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid"
);


ALTER TABLE "public"."equipment_products" OWNER TO "postgres";

--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "password_hash" "text" NOT NULL,
    "role" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "last_login" timestamp with time zone,
    "full_name" "text" DEFAULT ''::"text" NOT NULL,
    "is_frozen" boolean DEFAULT false NOT NULL,
    "frozen_at" timestamp with time zone,
    "frozen_by" "uuid",
    CONSTRAINT "users_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'vet'::"text", 'tech'::"text", 'viewer'::"text"])))
);


ALTER TABLE "public"."users" OWNER TO "postgres";

--
-- Name: cost_center_parts_usage; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."cost_center_parts_usage" AS
 SELECT "cc"."id" AS "cost_center_id",
    "cc"."name" AS "cost_center_name",
    "cc"."description" AS "cost_center_description",
    "cc"."color" AS "cost_center_color",
    "ei"."id" AS "invoice_id",
    "ei"."invoice_number",
    "ei"."invoice_date",
    "ei"."supplier_name",
    "ep"."id" AS "product_id",
    "ep"."name" AS "product_name",
    "ep"."product_code",
    "ep"."unit_type",
    "ec"."name" AS "category_name",
    "eii"."id" AS "item_id",
    "eii"."description" AS "item_description",
    "eii"."quantity",
    "eii"."unit_price",
    "eii"."total_price",
    "eia"."notes" AS "assignment_notes",
    "eia"."assigned_at",
    "u"."full_name" AS "assigned_by_name"
   FROM (((((("public"."equipment_invoice_item_assignments" "eia"
     JOIN "public"."equipment_invoice_items" "eii" ON (("eii"."id" = "eia"."invoice_item_id")))
     JOIN "public"."equipment_invoices" "ei" ON (("ei"."id" = "eii"."invoice_id")))
     LEFT JOIN "public"."equipment_products" "ep" ON (("ep"."id" = "eii"."product_id")))
     LEFT JOIN "public"."equipment_categories" "ec" ON (("ec"."id" = "ep"."category_id")))
     LEFT JOIN "public"."cost_centers" "cc" ON (("cc"."id" = "eia"."cost_center_id")))
     LEFT JOIN "public"."users" "u" ON (("u"."id" = "eia"."assigned_by")))
  WHERE ("eia"."assignment_type" = 'cost_center'::"text")
  ORDER BY "cc"."name", "ei"."invoice_date" DESC;


ALTER VIEW "public"."cost_center_parts_usage" OWNER TO "postgres";

--
-- Name: cost_center_summary_with_children; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."cost_center_summary_with_children" AS
 WITH RECURSIVE "cost_center_hierarchy" AS (
         SELECT "cost_center_direct_summary"."cost_center_id",
            "cost_center_direct_summary"."parent_id",
            "cost_center_direct_summary"."cost_center_id" AS "root_id",
            "cost_center_direct_summary"."direct_assignments",
            "cost_center_direct_summary"."direct_cost"
           FROM "public"."cost_center_direct_summary"
        UNION ALL
         SELECT "cch"."parent_id" AS "cost_center_id",
            "parent"."parent_id",
            "cch"."root_id",
            "cch"."direct_assignments",
            "cch"."direct_cost"
           FROM ("cost_center_hierarchy" "cch"
             JOIN "public"."cost_centers" "parent" ON (("parent"."id" = "cch"."parent_id")))
          WHERE ("cch"."parent_id" IS NOT NULL)
        ), "aggregated_totals" AS (
         SELECT "cost_center_hierarchy"."cost_center_id",
            "sum"("cost_center_hierarchy"."direct_assignments") AS "total_assignments",
            "sum"("cost_center_hierarchy"."direct_cost") AS "total_cost"
           FROM "cost_center_hierarchy"
          GROUP BY "cost_center_hierarchy"."cost_center_id"
        )
 SELECT "cds"."cost_center_id",
    "cds"."cost_center_name",
    "cds"."description",
    "cds"."color",
    "cds"."parent_id",
    "cds"."is_active",
    COALESCE("at"."total_assignments", ("cds"."direct_assignments")::numeric) AS "total_assignments",
    COALESCE("at"."total_cost", "cds"."direct_cost") AS "total_cost",
    "cds"."first_assignment_date",
    "cds"."last_assignment_date"
   FROM ("public"."cost_center_direct_summary" "cds"
     LEFT JOIN "aggregated_totals" "at" ON (("at"."cost_center_id" = "cds"."cost_center_id")))
  ORDER BY "cds"."cost_center_name";


ALTER VIEW "public"."cost_center_summary_with_children" OWNER TO "postgres";

--
-- Name: cost_center_summary; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."cost_center_summary" AS
 SELECT "cost_center_id",
    "cost_center_name",
    "description",
    "color",
    "parent_id",
    "is_active",
    "total_assignments",
    "total_cost",
    "first_assignment_date",
    "last_assignment_date"
   FROM "public"."cost_center_summary_with_children";


ALTER VIEW "public"."cost_center_summary" OWNER TO "postgres";

--
-- Name: course_doses; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."course_doses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "course_id" "uuid" NOT NULL,
    "day_number" integer NOT NULL,
    "scheduled_date" "date" NOT NULL,
    "administered_date" "date",
    "dose_amount" numeric,
    "unit" "public"."unit" NOT NULL,
    "administered_by" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "course_doses_day_number_check" CHECK (("day_number" > 0)),
    CONSTRAINT "course_doses_dose_amount_check" CHECK (("dose_amount" > (0)::numeric))
);


ALTER TABLE "public"."course_doses" OWNER TO "postgres";

--
-- Name: COLUMN "course_doses"."dose_amount"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."course_doses"."dose_amount" IS 'Actual dose amount administered. NULL until visit is completed and quantity is entered.';


--
-- Name: course_medication_schedules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."course_medication_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "course_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "batch_id" "uuid",
    "scheduled_date" "date" NOT NULL,
    "visit_id" "uuid",
    "unit" "text" DEFAULT 'ml'::"text" NOT NULL,
    "teat" "text",
    "purpose" "text" DEFAULT 'Gydymas'::"text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "course_medication_schedules_teat_check" CHECK (("teat" = ANY (ARRAY['d1'::"text", 'd2'::"text", 'k1'::"text", 'k2'::"text"])))
);


ALTER TABLE "public"."course_medication_schedules" OWNER TO "postgres";

--
-- Name: TABLE "course_medication_schedules"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."course_medication_schedules" IS 'Defines which medications should be used on which dates within a treatment course';


--
-- Name: COLUMN "course_medication_schedules"."batch_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."course_medication_schedules"."batch_id" IS 'Batch can be NULL at scheduling time, selected at visit completion';


--
-- Name: COLUMN "course_medication_schedules"."scheduled_date"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."course_medication_schedules"."scheduled_date" IS 'The date when this medication should be administered';


--
-- Name: COLUMN "course_medication_schedules"."visit_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."course_medication_schedules"."visit_id" IS 'Links to the actual visit when scheduled. NULL until visit is created.';


--
-- Name: diseases; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."diseases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text",
    "name" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."diseases" OWNER TO "postgres";

--
-- Name: equipment_batches; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."equipment_batches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid",
    "batch_number" "text",
    "lot_number" "text",
    "invoice_id" "uuid",
    "location_id" "uuid",
    "received_qty" numeric NOT NULL,
    "qty_left" numeric NOT NULL,
    "purchase_price" numeric,
    "expiry_date" "date",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    CONSTRAINT "equipment_batches_qty_left_check" CHECK (("qty_left" >= (0)::numeric))
);


ALTER TABLE "public"."equipment_batches" OWNER TO "postgres";

--
-- Name: equipment_issuance_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."equipment_issuance_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "issuance_id" "uuid",
    "batch_id" "uuid",
    "product_id" "uuid",
    "quantity" numeric NOT NULL,
    "quantity_returned" numeric DEFAULT 0,
    "unit_price" numeric,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "equipment_issuance_items_check" CHECK ((("quantity_returned" >= (0)::numeric) AND ("quantity_returned" <= "quantity"))),
    CONSTRAINT "equipment_issuance_items_quantity_check" CHECK (("quantity" > (0)::numeric))
);


ALTER TABLE "public"."equipment_issuance_items" OWNER TO "postgres";

--
-- Name: equipment_issuances; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."equipment_issuances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "issuance_number" "text" NOT NULL,
    "issued_to" "uuid",
    "issued_to_name" "text",
    "issued_by" "uuid",
    "issue_date" timestamp with time zone DEFAULT "now"(),
    "expected_return_date" "date",
    "actual_return_date" "date",
    "status" "text" DEFAULT 'issued'::"text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    CONSTRAINT "equipment_issuances_status_check" CHECK (("status" = ANY (ARRAY['issued'::"text", 'partial_return'::"text", 'returned'::"text", 'lost'::"text"])))
);


ALTER TABLE "public"."equipment_issuances" OWNER TO "postgres";

--
-- Name: equipment_items_on_loan; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."equipment_items_on_loan" AS
 SELECT "ei"."id" AS "issuance_id",
    "ei"."issuance_number",
    "ei"."issued_to",
    COALESCE("u"."full_name", "ei"."issued_to_name") AS "issued_to_name",
    "ei"."issue_date",
    "ei"."expected_return_date",
    "ei"."status",
    "p"."name" AS "product_name",
    "p"."unit_type",
    "eii"."quantity" AS "quantity_issued",
    "eii"."quantity_returned",
    ("eii"."quantity" - "eii"."quantity_returned") AS "quantity_outstanding",
    "eii"."unit_price",
    (("eii"."quantity" - "eii"."quantity_returned") * "eii"."unit_price") AS "value_outstanding"
   FROM ((("public"."equipment_issuances" "ei"
     JOIN "public"."equipment_issuance_items" "eii" ON (("eii"."issuance_id" = "ei"."id")))
     JOIN "public"."equipment_products" "p" ON (("p"."id" = "eii"."product_id")))
     LEFT JOIN "public"."users" "u" ON (("u"."id" = "ei"."issued_to")))
  WHERE (("ei"."status" = ANY (ARRAY['issued'::"text", 'partial_return'::"text"])) AND (("eii"."quantity" - "eii"."quantity_returned") > (0)::numeric))
  ORDER BY "ei"."issue_date" DESC;


ALTER VIEW "public"."equipment_items_on_loan" OWNER TO "postgres";

--
-- Name: equipment_locations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."equipment_locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "location_type" "text" DEFAULT 'warehouse'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."equipment_locations" OWNER TO "postgres";

--
-- Name: equipment_stock_movements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."equipment_stock_movements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "batch_id" "uuid" NOT NULL,
    "movement_type" "text" NOT NULL,
    "quantity" numeric NOT NULL,
    "reference_table" "text",
    "reference_id" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    CONSTRAINT "equipment_stock_movements_movement_type_check" CHECK (("movement_type" = ANY (ARRAY['issue'::"text", 'return'::"text", 'receive'::"text", 'adjustment'::"text"])))
);


ALTER TABLE "public"."equipment_stock_movements" OWNER TO "postgres";

--
-- Name: equipment_suppliers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."equipment_suppliers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "code" "text",
    "vat_code" "text",
    "address" "text",
    "phone" "text",
    "email" "text",
    "contact_person" "text",
    "notes" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid"
);


ALTER TABLE "public"."equipment_suppliers" OWNER TO "postgres";

--
-- Name: equipment_unassigned_invoice_items; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."equipment_unassigned_invoice_items" AS
 SELECT "eii"."id" AS "item_id",
    "eii"."invoice_id",
    "eii"."line_no",
    "eii"."product_id",
    "eii"."description",
    "eii"."quantity",
    "eii"."unit_price",
    "eii"."total_price",
    "eii"."vat_rate",
    "eii"."created_at" AS "item_created_at",
    "ei"."invoice_number",
    "ei"."invoice_date",
    "ei"."supplier_name",
    "ei"."supplier_id",
    "ep"."name" AS "product_name",
    "ep"."product_code",
    "ep"."unit_type",
    "ec"."name" AS "category_name",
    ( SELECT "count"(*) AS "count"
           FROM "public"."equipment_invoice_item_assignments"
          WHERE ("equipment_invoice_item_assignments"."invoice_item_id" = "eii"."id")) AS "assignment_count"
   FROM ((("public"."equipment_invoice_items" "eii"
     JOIN "public"."equipment_invoices" "ei" ON (("ei"."id" = "eii"."invoice_id")))
     LEFT JOIN "public"."equipment_products" "ep" ON (("ep"."id" = "eii"."product_id")))
     LEFT JOIN "public"."equipment_categories" "ec" ON (("ec"."id" = "ep"."category_id")))
  WHERE (NOT (EXISTS ( SELECT 1
           FROM "public"."equipment_invoice_item_assignments" "eia"
          WHERE ("eia"."invoice_item_id" = "eii"."id"))))
  ORDER BY "ei"."invoice_date" DESC, "eii"."line_no";


ALTER VIEW "public"."equipment_unassigned_invoice_items" OWNER TO "postgres";

--
-- Name: equipment_warehouse_stock; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."equipment_warehouse_stock" AS
 SELECT "p"."id" AS "product_id",
    "p"."name" AS "product_name",
    "p"."product_code",
    "p"."unit_type",
    "c"."name" AS "category_name",
    "sum"("b"."qty_left") AS "total_qty",
    "sum"(("b"."qty_left" * "b"."purchase_price")) AS "total_value",
    "count"("b"."id") AS "batch_count",
    "min"("b"."purchase_price") AS "min_price",
    "max"("b"."purchase_price") AS "max_price",
    "avg"("b"."purchase_price") AS "avg_price"
   FROM (("public"."equipment_products" "p"
     LEFT JOIN "public"."equipment_batches" "b" ON ((("b"."product_id" = "p"."id") AND ("b"."qty_left" > (0)::numeric))))
     LEFT JOIN "public"."equipment_categories" "c" ON (("c"."id" = "p"."category_id")))
  WHERE ("p"."is_active" = true)
  GROUP BY "p"."id", "p"."name", "p"."product_code", "p"."unit_type", "c"."name";


ALTER VIEW "public"."equipment_warehouse_stock" OWNER TO "postgres";

--
-- Name: farm_equipment; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."farm_equipment" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "location" "text",
    "category" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."farm_equipment" OWNER TO "postgres";

--
-- Name: farm_equipment_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."farm_equipment_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "farm_equipment_id" "uuid" NOT NULL,
    "item_name" "text" NOT NULL,
    "description" "text",
    "service_interval_value" integer NOT NULL,
    "service_interval_type" "text" NOT NULL,
    "reminder_days_before" integer DEFAULT 14 NOT NULL,
    "last_service_date" "date",
    "next_service_date" "date",
    "is_active" boolean DEFAULT true NOT NULL,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "farm_equipment_items_service_interval_type_check" CHECK (("service_interval_type" = ANY (ARRAY['days'::"text", 'weeks'::"text", 'months'::"text", 'years'::"text"])))
);


ALTER TABLE "public"."farm_equipment_items" OWNER TO "postgres";

--
-- Name: farm_equipment_service_parts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."farm_equipment_service_parts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "service_record_id" "uuid" NOT NULL,
    "batch_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "quantity_used" numeric NOT NULL,
    "unit_price" numeric,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    CONSTRAINT "farm_equipment_service_parts_quantity_used_check" CHECK (("quantity_used" > (0)::numeric))
);


ALTER TABLE "public"."farm_equipment_service_parts" OWNER TO "postgres";

--
-- Name: farm_equipment_service_records; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."farm_equipment_service_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "farm_equipment_item_id" "uuid" NOT NULL,
    "service_date" "date" NOT NULL,
    "performed_by" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."farm_equipment_service_records" OWNER TO "postgres";

--
-- Name: farm_equipment_cost_overview; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."farm_equipment_cost_overview" AS
 SELECT "fe"."id" AS "equipment_id",
    "fe"."name" AS "equipment_name",
    "fe"."location",
    "fe"."category",
    "fe"."description",
    "count"(DISTINCT "fei"."id") AS "total_items",
    "count"(DISTINCT "fei"."id") FILTER (WHERE ("fei"."is_active" = true)) AS "active_items",
    "count"(DISTINCT "fsr"."id") AS "total_services",
    "count"(DISTINCT "fsp"."id") AS "total_parts_used",
    COALESCE("sum"(("fsp"."quantity_used" * "fsp"."unit_price")), (0)::numeric) AS "total_cost",
    COALESCE("avg"(("fsp"."quantity_used" * "fsp"."unit_price")), (0)::numeric) AS "avg_service_cost",
    "min"("fsr"."service_date") AS "first_service_date",
    "max"("fsr"."service_date") AS "last_service_date"
   FROM ((("public"."farm_equipment" "fe"
     LEFT JOIN "public"."farm_equipment_items" "fei" ON (("fei"."farm_equipment_id" = "fe"."id")))
     LEFT JOIN "public"."farm_equipment_service_records" "fsr" ON (("fsr"."farm_equipment_item_id" = "fei"."id")))
     LEFT JOIN "public"."farm_equipment_service_parts" "fsp" ON (("fsp"."service_record_id" = "fsr"."id")))
  WHERE ("fe"."is_active" = true)
  GROUP BY "fe"."id", "fe"."name", "fe"."location", "fe"."category", "fe"."description"
  ORDER BY COALESCE("sum"(("fsp"."quantity_used" * "fsp"."unit_price")), (0)::numeric) DESC;


ALTER VIEW "public"."farm_equipment_cost_overview" OWNER TO "postgres";

--
-- Name: farm_equipment_items_detail; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."farm_equipment_items_detail" AS
 SELECT "fei"."id",
    "fei"."farm_equipment_id",
    "fe"."name" AS "equipment_name",
    "fe"."location" AS "equipment_location",
    "fe"."category" AS "equipment_category",
    "fei"."item_name",
    "fei"."description",
    "fei"."service_interval_value",
    "fei"."service_interval_type",
    "fei"."reminder_days_before",
    "fei"."last_service_date",
    "fei"."next_service_date",
    "fei"."is_active",
    "fei"."notes",
        CASE
            WHEN ("fei"."next_service_date" IS NULL) THEN NULL::integer
            ELSE ("fei"."next_service_date" - CURRENT_DATE)
        END AS "days_until_service",
        CASE
            WHEN ("fei"."next_service_date" IS NULL) THEN 'not_scheduled'::"text"
            WHEN ("fei"."next_service_date" < CURRENT_DATE) THEN 'overdue'::"text"
            WHEN (("fei"."next_service_date" >= CURRENT_DATE) AND ("fei"."next_service_date" <= (CURRENT_DATE + "fei"."reminder_days_before"))) THEN 'upcoming'::"text"
            ELSE 'ok'::"text"
        END AS "service_status",
    ( SELECT "count"(*) AS "count"
           FROM "public"."farm_equipment_service_records"
          WHERE ("farm_equipment_service_records"."farm_equipment_item_id" = "fei"."id")) AS "service_count",
    "fei"."created_at",
    "fei"."updated_at"
   FROM ("public"."farm_equipment_items" "fei"
     JOIN "public"."farm_equipment" "fe" ON (("fe"."id" = "fei"."farm_equipment_id")))
  WHERE ("fei"."is_active" = true)
  ORDER BY "fei"."next_service_date", "fe"."name", "fei"."item_name";


ALTER VIEW "public"."farm_equipment_items_detail" OWNER TO "postgres";

--
-- Name: farm_equipment_service_cost_summary; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."farm_equipment_service_cost_summary" AS
 SELECT "fe"."id" AS "equipment_id",
    "fe"."name" AS "equipment_name",
    "fe"."location" AS "equipment_location",
    "fe"."category" AS "equipment_category",
    "fei"."id" AS "item_id",
    "fei"."item_name",
    "fei"."service_interval_value",
    "fei"."service_interval_type",
    "count"(DISTINCT "fsr"."id") AS "total_services",
    "min"("fsr"."service_date") AS "first_service_date",
    "max"("fsr"."service_date") AS "last_service_date",
    "count"(DISTINCT "fsp"."id") AS "total_parts_used",
    COALESCE("sum"(("fsp"."quantity_used" * "fsp"."unit_price")), (0)::numeric) AS "total_parts_cost",
    ( SELECT "farm_equipment_service_records"."service_date"
           FROM "public"."farm_equipment_service_records"
          WHERE ("farm_equipment_service_records"."farm_equipment_item_id" = "fei"."id")
          ORDER BY "farm_equipment_service_records"."service_date" DESC
         LIMIT 1) AS "latest_service_date"
   FROM ((("public"."farm_equipment" "fe"
     JOIN "public"."farm_equipment_items" "fei" ON (("fei"."farm_equipment_id" = "fe"."id")))
     LEFT JOIN "public"."farm_equipment_service_records" "fsr" ON (("fsr"."farm_equipment_item_id" = "fei"."id")))
     LEFT JOIN "public"."farm_equipment_service_parts" "fsp" ON (("fsp"."service_record_id" = "fsr"."id")))
  WHERE (("fe"."is_active" = true) AND ("fei"."is_active" = true))
  GROUP BY "fe"."id", "fe"."name", "fe"."location", "fe"."category", "fei"."id", "fei"."item_name", "fei"."service_interval_value", "fei"."service_interval_type"
  ORDER BY COALESCE("sum"(("fsp"."quantity_used" * "fsp"."unit_price")), (0)::numeric) DESC;


ALTER VIEW "public"."farm_equipment_service_cost_summary" OWNER TO "postgres";

--
-- Name: farm_equipment_service_details; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."farm_equipment_service_details" AS
 SELECT "fsr"."id" AS "service_record_id",
    "fsr"."service_date",
    "fsr"."notes" AS "service_notes",
    "fe"."id" AS "equipment_id",
    "fe"."name" AS "equipment_name",
    "fe"."location" AS "equipment_location",
    "fe"."category" AS "equipment_category",
    "fei"."id" AS "item_id",
    "fei"."item_name",
    "fsp"."id" AS "part_id",
    "ep"."name" AS "product_name",
    "ep"."product_code",
    "ep"."unit_type",
    "fsp"."quantity_used",
    "fsp"."unit_price",
    ("fsp"."quantity_used" * "fsp"."unit_price") AS "part_total_cost",
    "fsp"."notes" AS "part_notes",
    "eb"."batch_number",
    "u"."full_name" AS "performed_by_name",
    "fsr"."created_at"
   FROM (((((("public"."farm_equipment_service_records" "fsr"
     JOIN "public"."farm_equipment_items" "fei" ON (("fei"."id" = "fsr"."farm_equipment_item_id")))
     JOIN "public"."farm_equipment" "fe" ON (("fe"."id" = "fei"."farm_equipment_id")))
     LEFT JOIN "public"."farm_equipment_service_parts" "fsp" ON (("fsp"."service_record_id" = "fsr"."id")))
     LEFT JOIN "public"."equipment_products" "ep" ON (("ep"."id" = "fsp"."product_id")))
     LEFT JOIN "public"."equipment_batches" "eb" ON (("eb"."id" = "fsp"."batch_id")))
     LEFT JOIN "public"."users" "u" ON (("u"."id" = "fsr"."performed_by")))
  WHERE ("fe"."is_active" = true)
  ORDER BY "fsr"."service_date" DESC, "fsr"."created_at" DESC;


ALTER VIEW "public"."farm_equipment_service_details" OWNER TO "postgres";

--
-- Name: farm_equipment_summary; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."farm_equipment_summary" AS
 SELECT "fe"."id",
    "fe"."name",
    "fe"."description",
    "fe"."location",
    "fe"."category",
    "fe"."is_active",
    "count"("fei"."id") AS "total_items",
    "count"("fei"."id") FILTER (WHERE ("fei"."is_active" = true)) AS "active_items",
    "count"("fei"."id") FILTER (WHERE ("fei"."next_service_date" < CURRENT_DATE)) AS "overdue_items",
    "count"("fei"."id") FILTER (WHERE (("fei"."next_service_date" >= CURRENT_DATE) AND ("fei"."next_service_date" <= (CURRENT_DATE + "fei"."reminder_days_before")))) AS "upcoming_items",
    "min"("fei"."next_service_date") AS "next_service_due",
    "fe"."created_at",
    "fe"."updated_at"
   FROM ("public"."farm_equipment" "fe"
     LEFT JOIN "public"."farm_equipment_items" "fei" ON (("fei"."farm_equipment_id" = "fe"."id")))
  WHERE ("fe"."is_active" = true)
  GROUP BY "fe"."id", "fe"."name", "fe"."description", "fe"."location", "fe"."category", "fe"."is_active", "fe"."created_at", "fe"."updated_at"
  ORDER BY "fe"."name";


ALTER VIEW "public"."farm_equipment_summary" OWNER TO "postgres";

--
-- Name: fire_extinguishers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."fire_extinguishers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "serial_number" "text" NOT NULL,
    "placement_type" "text" NOT NULL,
    "location_id" "uuid",
    "vehicle_id" "uuid",
    "capacity" "text",
    "type" "text",
    "expiry_date" "date" NOT NULL,
    "last_inspection_date" "date",
    "next_inspection_date" "date",
    "status" "text" DEFAULT 'active'::"text",
    "notes" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    CONSTRAINT "fire_extinguishers_placement_check" CHECK (((("placement_type" = 'indoors'::"text") AND ("location_id" IS NOT NULL) AND ("vehicle_id" IS NULL)) OR (("placement_type" = 'transport'::"text") AND ("vehicle_id" IS NOT NULL) AND ("location_id" IS NULL)))),
    CONSTRAINT "fire_extinguishers_placement_type_check" CHECK (("placement_type" = ANY (ARRAY['indoors'::"text", 'transport'::"text"]))),
    CONSTRAINT "fire_extinguishers_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'expired'::"text", 'in_service'::"text", 'retired'::"text"])))
);


ALTER TABLE "public"."fire_extinguishers" OWNER TO "postgres";

--
-- Name: gea_daily_ataskaita1; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."gea_daily_ataskaita1" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "import_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cow_number" "text" NOT NULL,
    "ear_number" "text",
    "cow_state" "text",
    "group_number" "text",
    "pregnant_since" "date",
    "lactation_days" integer,
    "inseminated_at" "date",
    "pregnant_days" integer,
    "next_pregnancy_date" "date",
    "days_until_waiting_pregnancy" integer,
    "raw" "jsonb"
);


ALTER TABLE "public"."gea_daily_ataskaita1" OWNER TO "postgres";

--
-- Name: gea_daily_ataskaita2; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."gea_daily_ataskaita2" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "import_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cow_number" "text" NOT NULL,
    "genetic_worth" "text",
    "blood_line" "text",
    "avg_milk_prod_weight" numeric,
    "produce_milk" boolean,
    "last_milking_date" "date",
    "last_milking_time" "text",
    "last_milking_weight" numeric,
    "milkings" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "raw" "jsonb"
);


ALTER TABLE "public"."gea_daily_ataskaita2" OWNER TO "postgres";

--
-- Name: gea_daily_ataskaita3; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."gea_daily_ataskaita3" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "import_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cow_number" "text" NOT NULL,
    "teat_missing_right_back" boolean,
    "teat_missing_back_left" boolean,
    "teat_missing_front_left" boolean,
    "teat_missing_front_right" boolean,
    "insemination_count" integer,
    "bull_1" "text",
    "bull_2" "text",
    "bull_3" "text",
    "lactation_number" integer,
    "raw" "jsonb"
);


ALTER TABLE "public"."gea_daily_ataskaita3" OWNER TO "postgres";

--
-- Name: gea_daily_imports; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."gea_daily_imports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "source_filename" "text",
    "source_sha256" "text",
    "source_size_bytes" bigint,
    "marker_i1" integer,
    "marker_i2" integer,
    "marker_i3" integer,
    "count_ataskaita1" integer DEFAULT 0 NOT NULL,
    "count_ataskaita2" integer DEFAULT 0 NOT NULL,
    "count_ataskaita3" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."gea_daily_imports" OWNER TO "postgres";

--
-- Name: gea_daily_cows_joined; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."gea_daily_cows_joined" AS
 WITH "all_cows" AS (
         SELECT DISTINCT "combined"."import_id",
            "combined"."cow_number"
           FROM ( SELECT "gea_daily_ataskaita1"."import_id",
                    "gea_daily_ataskaita1"."cow_number"
                   FROM "public"."gea_daily_ataskaita1"
                UNION
                 SELECT "gea_daily_ataskaita2"."import_id",
                    "gea_daily_ataskaita2"."cow_number"
                   FROM "public"."gea_daily_ataskaita2"
                UNION
                 SELECT "gea_daily_ataskaita3"."import_id",
                    "gea_daily_ataskaita3"."cow_number"
                   FROM "public"."gea_daily_ataskaita3") "combined"
        )
 SELECT "i"."id" AS "import_id",
    "i"."created_at" AS "import_created_at",
    "ac"."cow_number",
    "a1"."ear_number",
    "a1"."cow_state",
    "a1"."group_number",
    "a1"."pregnant_since",
    "a1"."lactation_days",
    "a1"."inseminated_at",
    "a1"."pregnant_days",
    "a1"."next_pregnancy_date",
    "a1"."days_until_waiting_pregnancy",
    "a2"."genetic_worth",
    "a2"."blood_line",
    "a2"."avg_milk_prod_weight",
    "a2"."produce_milk",
    "a2"."last_milking_date",
    "a2"."last_milking_time",
    "a2"."last_milking_weight",
    "a2"."milkings",
    "a3"."teat_missing_right_back",
    "a3"."teat_missing_back_left",
    "a3"."teat_missing_front_left",
    "a3"."teat_missing_front_right",
    "a3"."insemination_count",
    "a3"."bull_1",
    "a3"."bull_2",
    "a3"."bull_3",
    "a3"."lactation_number"
   FROM (((("all_cows" "ac"
     JOIN "public"."gea_daily_imports" "i" ON (("i"."id" = "ac"."import_id")))
     LEFT JOIN "public"."gea_daily_ataskaita1" "a1" ON ((("a1"."import_id" = "ac"."import_id") AND ("a1"."cow_number" = "ac"."cow_number"))))
     LEFT JOIN "public"."gea_daily_ataskaita2" "a2" ON ((("a2"."import_id" = "ac"."import_id") AND ("a2"."cow_number" = "ac"."cow_number"))))
     LEFT JOIN "public"."gea_daily_ataskaita3" "a3" ON ((("a3"."import_id" = "ac"."import_id") AND ("a3"."cow_number" = "ac"."cow_number"))))
  ORDER BY "i"."created_at" DESC, "ac"."cow_number";


ALTER VIEW "public"."gea_daily_cows_joined" OWNER TO "postgres";

--
-- Name: VIEW "gea_daily_cows_joined"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON VIEW "public"."gea_daily_cows_joined" IS 'Joined view of all three GEA ataskaita tables. Fixed to show all cows regardless of which tables have data.';


--
-- Name: hoof_records; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."hoof_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "animal_id" "uuid" NOT NULL,
    "visit_id" "uuid",
    "examination_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "leg" "text" NOT NULL,
    "claw" "text" NOT NULL,
    "condition_code" "text",
    "severity" integer,
    "was_trimmed" boolean DEFAULT false,
    "was_treated" boolean DEFAULT false,
    "treatment_product_id" "uuid",
    "treatment_batch_id" "uuid",
    "treatment_quantity" numeric(10,3),
    "treatment_unit" "public"."unit",
    "treatment_notes" "text",
    "bandage_applied" boolean DEFAULT false,
    "requires_followup" boolean DEFAULT false,
    "followup_date" "date",
    "followup_completed" boolean DEFAULT false,
    "technician_name" "text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "hoof_records_claw_check" CHECK (("claw" = ANY (ARRAY['inner'::"text", 'outer'::"text"]))),
    CONSTRAINT "hoof_records_leg_check" CHECK (("leg" = ANY (ARRAY['FL'::"text", 'FR'::"text", 'HL'::"text", 'HR'::"text"]))),
    CONSTRAINT "hoof_records_severity_check" CHECK ((("severity" >= 0) AND ("severity" <= 4)))
);


ALTER TABLE "public"."hoof_records" OWNER TO "postgres";

--
-- Name: TABLE "hoof_records"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."hoof_records" IS 'Main table tracking all hoof examinations, conditions, and treatments per animal';


--
-- Name: hoof_analytics_summary; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."hoof_analytics_summary" AS
 SELECT "a"."id" AS "animal_id",
    "a"."tag_no",
    "a"."species",
    "count"(DISTINCT "hr"."id") AS "total_examinations",
    "max"("hr"."examination_date") AS "last_examination_date",
    "count"(DISTINCT "hr"."id") FILTER (WHERE (("hr"."condition_code" IS NOT NULL) AND ("hr"."condition_code" <> 'OK'::"text"))) AS "total_conditions_found",
    "count"(DISTINCT "hr"."id") FILTER (WHERE (("hr"."requires_followup" = true) AND ("hr"."followup_completed" = false))) AS "pending_followups",
    "avg"("hr"."severity") FILTER (WHERE ("hr"."severity" IS NOT NULL)) AS "avg_severity",
    "count"(DISTINCT "hr"."id") FILTER (WHERE ("hr"."was_trimmed" = true)) AS "total_trims",
    "count"(DISTINCT "hr"."id") FILTER (WHERE ("hr"."was_treated" = true)) AS "total_treatments",
    ( SELECT "count"(*) AS "count"
           FROM "public"."hoof_records" "hr2"
          WHERE (("hr2"."animal_id" = "a"."id") AND ("hr2"."condition_code" IS NOT NULL) AND ("hr2"."condition_code" <> 'OK'::"text") AND (EXISTS ( SELECT 1
                   FROM "public"."hoof_records" "hr3"
                  WHERE (("hr3"."animal_id" = "hr2"."animal_id") AND ("hr3"."leg" = "hr2"."leg") AND ("hr3"."claw" = "hr2"."claw") AND ("hr3"."condition_code" = "hr2"."condition_code") AND ("hr3"."examination_date" < "hr2"."examination_date") AND ("hr3"."examination_date" >= ("hr2"."examination_date" - '60 days'::interval)) AND ("hr3"."id" <> "hr2"."id")))))) AS "recurring_conditions_count",
    ( SELECT "hr4"."condition_code"
           FROM "public"."hoof_records" "hr4"
          WHERE (("hr4"."animal_id" = "a"."id") AND ("hr4"."condition_code" IS NOT NULL) AND ("hr4"."condition_code" <> 'OK'::"text"))
          GROUP BY "hr4"."condition_code"
          ORDER BY ("count"(*)) DESC
         LIMIT 1) AS "most_common_condition",
        CASE
            WHEN ("max"("hr"."examination_date") FILTER (WHERE ("hr"."was_trimmed" = true)) IS NOT NULL) THEN (CURRENT_DATE - "max"("hr"."examination_date") FILTER (WHERE ("hr"."was_trimmed" = true)))
            ELSE NULL::integer
        END AS "days_since_last_trim"
   FROM ("public"."animals" "a"
     LEFT JOIN "public"."hoof_records" "hr" ON (("hr"."animal_id" = "a"."id")))
  GROUP BY "a"."id", "a"."tag_no", "a"."species";


ALTER VIEW "public"."hoof_analytics_summary" OWNER TO "postgres";

--
-- Name: VIEW "hoof_analytics_summary"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON VIEW "public"."hoof_analytics_summary" IS 'Per-animal summary of hoof health including examination counts, conditions, and follow-up status';


--
-- Name: hoof_condition_codes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."hoof_condition_codes" (
    "code" "text" NOT NULL,
    "name_lt" "text" NOT NULL,
    "name_en" "text" NOT NULL,
    "description" "text",
    "typical_severity_range" "text",
    "treatment_notes" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."hoof_condition_codes" OWNER TO "postgres";

--
-- Name: TABLE "hoof_condition_codes"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."hoof_condition_codes" IS 'Reference table for standardized hoof condition codes used internationally';


--
-- Name: hoof_condition_trends; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."hoof_condition_trends" AS
 SELECT "date_trunc"('month'::"text", ("hr"."examination_date")::timestamp with time zone) AS "month",
    "hr"."condition_code",
    "hcc"."name_lt" AS "condition_name",
    "count"(*) AS "occurrence_count",
    "avg"("hr"."severity") AS "avg_severity",
    "count"(DISTINCT "hr"."animal_id") AS "affected_animals_count",
    "count"(*) FILTER (WHERE ("hr"."was_treated" = true)) AS "treated_count",
    "count"(*) FILTER (WHERE ("hr"."severity" >= 3)) AS "severe_count"
   FROM ("public"."hoof_records" "hr"
     LEFT JOIN "public"."hoof_condition_codes" "hcc" ON (("hcc"."code" = "hr"."condition_code")))
  WHERE (("hr"."condition_code" IS NOT NULL) AND ("hr"."condition_code" <> 'OK'::"text") AND ("hr"."examination_date" >= (CURRENT_DATE - '1 year'::interval)))
  GROUP BY ("date_trunc"('month'::"text", ("hr"."examination_date")::timestamp with time zone)), "hr"."condition_code", "hcc"."name_lt"
  ORDER BY ("date_trunc"('month'::"text", ("hr"."examination_date")::timestamp with time zone)) DESC, ("count"(*)) DESC;


ALTER VIEW "public"."hoof_condition_trends" OWNER TO "postgres";

--
-- Name: VIEW "hoof_condition_trends"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON VIEW "public"."hoof_condition_trends" IS 'Monthly trends of hoof conditions across the herd for the past 12 months';


--
-- Name: hoof_followup_needed; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."hoof_followup_needed" AS
 SELECT "hr"."id" AS "hoof_record_id",
    "hr"."animal_id",
    "a"."tag_no",
    "hr"."examination_date",
    "hr"."followup_date",
    "hr"."leg",
    "hr"."claw",
    "hr"."condition_code",
    "hcc"."name_lt" AS "condition_name",
    "hr"."severity",
    "hr"."technician_name",
    "hr"."notes",
    ("hr"."followup_date" - CURRENT_DATE) AS "days_until_followup"
   FROM (("public"."hoof_records" "hr"
     JOIN "public"."animals" "a" ON (("a"."id" = "hr"."animal_id")))
     LEFT JOIN "public"."hoof_condition_codes" "hcc" ON (("hcc"."code" = "hr"."condition_code")))
  WHERE (("hr"."requires_followup" = true) AND ("hr"."followup_completed" = false) AND ("hr"."followup_date" IS NOT NULL))
  ORDER BY "hr"."followup_date";


ALTER VIEW "public"."hoof_followup_needed" OWNER TO "postgres";

--
-- Name: VIEW "hoof_followup_needed"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON VIEW "public"."hoof_followup_needed" IS 'List of animals requiring follow-up examinations with days until due';


--
-- Name: hoof_recurring_problems; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."hoof_recurring_problems" AS
 SELECT "hr1"."animal_id",
    "a"."tag_no",
    "hr1"."leg",
    "hr1"."claw",
    "hr1"."condition_code",
    "hcc"."name_lt" AS "condition_name",
    "hr1"."examination_date" AS "latest_examination",
    "hr2"."examination_date" AS "previous_examination",
    ("hr1"."examination_date" - "hr2"."examination_date") AS "days_between",
    "count"(*) OVER (PARTITION BY "hr1"."animal_id", "hr1"."leg", "hr1"."claw", "hr1"."condition_code") AS "recurrence_count"
   FROM ((("public"."hoof_records" "hr1"
     JOIN "public"."hoof_records" "hr2" ON ((("hr2"."animal_id" = "hr1"."animal_id") AND ("hr2"."leg" = "hr1"."leg") AND ("hr2"."claw" = "hr1"."claw") AND ("hr2"."condition_code" = "hr1"."condition_code") AND ("hr2"."examination_date" < "hr1"."examination_date") AND ("hr2"."examination_date" >= ("hr1"."examination_date" - '60 days'::interval)))))
     JOIN "public"."animals" "a" ON (("a"."id" = "hr1"."animal_id")))
     LEFT JOIN "public"."hoof_condition_codes" "hcc" ON (("hcc"."code" = "hr1"."condition_code")))
  WHERE (("hr1"."condition_code" IS NOT NULL) AND ("hr1"."condition_code" <> 'OK'::"text"))
  ORDER BY "hr1"."examination_date" DESC, ("count"(*) OVER (PARTITION BY "hr1"."animal_id", "hr1"."leg", "hr1"."claw", "hr1"."condition_code")) DESC;


ALTER VIEW "public"."hoof_recurring_problems" OWNER TO "postgres";

--
-- Name: VIEW "hoof_recurring_problems"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON VIEW "public"."hoof_recurring_problems" IS 'Identifies recurring hoof problems on the same claw within 60-day periods';


--
-- Name: insemination_inventory; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."insemination_inventory" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "quantity" numeric(10,2) DEFAULT 0 NOT NULL,
    "batch_number" "text",
    "expiry_date" "date",
    "received_date" "date" DEFAULT CURRENT_DATE,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."insemination_inventory" OWNER TO "postgres";

--
-- Name: insemination_products; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."insemination_products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "product_type" "text" NOT NULL,
    "supplier_group" "text" DEFAULT 'PASARU GRUPE'::"text",
    "unit" "text" DEFAULT 'vnt'::"text",
    "price" numeric(10,2),
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "insemination_products_product_type_check" CHECK (("product_type" = ANY (ARRAY['SPERM'::"text", 'GLOVES'::"text"])))
);


ALTER TABLE "public"."insemination_products" OWNER TO "postgres";

--
-- Name: insemination_records; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."insemination_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sync_step_id" "uuid",
    "animal_id" "uuid" NOT NULL,
    "insemination_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "sperm_product_id" "uuid" NOT NULL,
    "sperm_quantity" numeric(10,2) NOT NULL,
    "glove_product_id" "uuid",
    "glove_quantity" numeric(10,2),
    "notes" "text",
    "performed_by" "uuid",
    "pregnancy_confirmed" boolean,
    "pregnancy_check_date" "date",
    "pregnancy_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."insemination_records" OWNER TO "postgres";

--
-- Name: invoice_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."invoice_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "batch_id" "uuid",
    "product_id" "uuid",
    "line_no" integer,
    "description" "text",
    "sku" "text",
    "quantity" numeric(10,2),
    "unit_price" numeric(10,2),
    "total_price" numeric(10,2),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."invoice_items" OWNER TO "postgres";

--
-- Name: invoices; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_number" "text" NOT NULL,
    "invoice_date" "date" NOT NULL,
    "supplier_id" "uuid",
    "total_amount" numeric,
    "currency" "text" DEFAULT 'EUR'::"text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "doc_title" "text" DEFAULT 'Invoice'::"text",
    "supplier_name" "text",
    "supplier_code" "text",
    "supplier_vat" "text",
    "total_net" numeric(10,2) DEFAULT 0,
    "total_vat" numeric(10,2) DEFAULT 0,
    "total_gross" numeric(10,2) DEFAULT 0,
    "vat_rate" numeric(5,2) DEFAULT 0,
    "pdf_filename" "text",
    "created_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."invoices" OWNER TO "postgres";

--
-- Name: maintenance_schedules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."maintenance_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vehicle_id" "uuid",
    "schedule_name" "text" NOT NULL,
    "maintenance_type" "text" NOT NULL,
    "interval_type" "text" NOT NULL,
    "interval_value" numeric NOT NULL,
    "last_performed_date" "date",
    "last_performed_mileage" numeric,
    "last_performed_hours" numeric,
    "next_due_date" "date",
    "next_due_mileage" numeric,
    "next_due_hours" numeric,
    "estimated_duration_hours" numeric,
    "estimated_cost" numeric,
    "is_active" boolean DEFAULT true,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid"
);


ALTER TABLE "public"."maintenance_schedules" OWNER TO "postgres";

--
-- Name: maintenance_work_orders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."maintenance_work_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "work_order_number" "text" NOT NULL,
    "vehicle_id" "uuid",
    "tool_id" "uuid",
    "order_type" "text" NOT NULL,
    "priority" "text" DEFAULT 'medium'::"text",
    "description" "text" NOT NULL,
    "scheduled_date" "date",
    "started_date" timestamp with time zone,
    "completed_date" timestamp with time zone,
    "status" "text" DEFAULT 'pending'::"text",
    "assigned_to" "uuid",
    "odometer_reading" numeric,
    "engine_hours" numeric,
    "labor_hours" numeric DEFAULT 0,
    "labor_cost" numeric DEFAULT 0,
    "parts_cost" numeric DEFAULT 0,
    "total_cost" numeric DEFAULT 0,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "schedule_id" "uuid",
    "service_visit_id" "uuid",
    "assigned_mechanic" "text",
    "estimated_cost" numeric,
    CONSTRAINT "maintenance_work_orders_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'in_progress'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."maintenance_work_orders" OWNER TO "postgres";

--
-- Name: medical_waste; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."medical_waste" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "waste_code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "period" "text",
    "date" "date",
    "qty_generated" numeric,
    "qty_transferred" numeric,
    "carrier" "text",
    "processor" "text",
    "transfer_date" "date",
    "doc_no" "text",
    "responsible" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "auto_generated" boolean DEFAULT false NOT NULL,
    "source_batch_id" "uuid",
    "source_product_id" "uuid",
    "package_count" integer,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "medical_waste_package_count_check" CHECK (("package_count" > 0))
);


ALTER TABLE "public"."medical_waste" OWNER TO "postgres";

--
-- Name: COLUMN "medical_waste"."auto_generated"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."medical_waste"."auto_generated" IS 'True if this waste entry was automatically generated when batch reached zero stock';


--
-- Name: COLUMN "medical_waste"."source_batch_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."medical_waste"."source_batch_id" IS 'Reference to the batch that generated this waste (for auto-generated entries)';


--
-- Name: COLUMN "medical_waste"."source_product_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."medical_waste"."source_product_id" IS 'Reference to the product that generated this waste (for auto-generated entries)';


--
-- Name: COLUMN "medical_waste"."package_count"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."medical_waste"."package_count" IS 'Number of empty packages for auto-generated waste entries';


--
-- Name: milk_composition_tests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."milk_composition_tests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "producer_id" "uuid",
    "scrape_session_id" "uuid",
    "paemimo_data" "date" NOT NULL,
    "atvezimo_data" "date" NOT NULL,
    "tyrimo_data" "date" NOT NULL,
    "riebalu_kiekis" numeric(5,2),
    "baltymu_kiekis" numeric(5,2),
    "laktozes_kiekis" numeric(5,2),
    "persk_koef" numeric(6,3),
    "ureja_mg_100ml" integer,
    "ph" numeric(4,2),
    "pastaba" "text" DEFAULT ''::"text",
    "konteineris" "text" NOT NULL,
    "plomba" "text" DEFAULT ''::"text",
    "prot_nr" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "milk_weight_id" "uuid"
);


ALTER TABLE "public"."milk_composition_tests" OWNER TO "postgres";

--
-- Name: COLUMN "milk_composition_tests"."milk_weight_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."milk_composition_tests"."milk_weight_id" IS 'Links composition test to milk weight record. Matched by date and session_type.';


--
-- Name: milk_producers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."milk_producers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "gamintojo_id" "text" NOT NULL,
    "gamintojas_code" "text" NOT NULL,
    "label" "text" NOT NULL,
    "imone" "text",
    "rajonas" "text" NOT NULL,
    "punktas" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."milk_producers" OWNER TO "postgres";

--
-- Name: milk_quality_tests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."milk_quality_tests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "producer_id" "uuid",
    "scrape_session_id" "uuid",
    "paemimo_data" "date" NOT NULL,
    "atvezimo_data" "date" NOT NULL,
    "tyrimo_data" "date" NOT NULL,
    "somatiniu_lasteliu_skaicius" integer,
    "bendras_bakteriju_skaicius" integer,
    "neatit_pst" "text" DEFAULT ''::"text",
    "konteineris" "text" NOT NULL,
    "plomba" "text" DEFAULT ''::"text",
    "prot_nr" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "milk_weight_id" "uuid"
);


ALTER TABLE "public"."milk_quality_tests" OWNER TO "postgres";

--
-- Name: COLUMN "milk_quality_tests"."milk_weight_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."milk_quality_tests"."milk_weight_id" IS 'Links quality test to milk weight record. Matched by date and session_type.';


--
-- Name: milk_weights; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."milk_weights" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "date" "date" NOT NULL,
    "session_type" "text" NOT NULL,
    "weight" integer NOT NULL,
    "session_id" "text",
    "measurement_timestamp" timestamp with time zone NOT NULL,
    "timezone" "text",
    "hose_status" "text",
    "stable_status" boolean,
    "raw_data" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "event_type" "text",
    CONSTRAINT "milk_weights_session_type_check" CHECK (("session_type" = ANY (ARRAY['rytinis'::"text", 'naktinis'::"text"])))
);


ALTER TABLE "public"."milk_weights" OWNER TO "postgres";

--
-- Name: TABLE "milk_weights"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."milk_weights" IS 'Stores daily milk weight measurements from milking sessions. One row per day per session type (morning/evening).';


--
-- Name: COLUMN "milk_weights"."event_type"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."milk_weights"."event_type" IS 'Event type from webhook: RECOVERY (milk accumulation), ALERT (milk unloaded), etc.';


--
-- Name: milk_data_combined; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."milk_data_combined" WITH ("security_invoker"='true') AS
 SELECT "mw"."id" AS "weight_id",
    "mw"."date",
    "mw"."session_type",
    "mw"."weight" AS "milk_weight_kg",
    "mw"."session_id",
    "mw"."measurement_timestamp",
    "mw"."event_type",
    "mct"."id" AS "composition_test_id",
    "mct"."paemimo_data" AS "composition_paemimo_data",
    "mct"."tyrimo_data" AS "composition_tyrimo_data",
    "mct"."riebalu_kiekis" AS "fat_percentage",
    "mct"."baltymu_kiekis" AS "protein_percentage",
    "mct"."laktozes_kiekis" AS "lactose_percentage",
    "mct"."persk_koef" AS "conversion_coefficient",
    "mct"."ureja_mg_100ml" AS "urea_mg_100ml",
    "mct"."ph" AS "ph_level",
    "mct"."prot_nr" AS "composition_protocol_nr",
    "mqt"."id" AS "quality_test_id",
    "mqt"."paemimo_data" AS "quality_paemimo_data",
    "mqt"."tyrimo_data" AS "quality_tyrimo_data",
    "mqt"."somatiniu_lasteliu_skaicius" AS "somatic_cell_count",
    "mqt"."bendras_bakteriju_skaicius" AS "total_bacteria_count",
    "mqt"."neatit_pst" AS "non_compliance_pst",
    "mqt"."prot_nr" AS "quality_protocol_nr",
    "mp"."id" AS "producer_id",
    "mp"."gamintojas_code" AS "producer_code",
    "mp"."imone" AS "company_name",
    "mp"."rajonas" AS "region",
    "mp"."punktas" AS "collection_point",
    "mw"."created_at" AS "weight_recorded_at",
    "mct"."created_at" AS "composition_recorded_at",
    "mqt"."created_at" AS "quality_recorded_at"
   FROM ((("public"."milk_weights" "mw"
     LEFT JOIN "public"."milk_composition_tests" "mct" ON (("mct"."milk_weight_id" = "mw"."id")))
     LEFT JOIN "public"."milk_quality_tests" "mqt" ON (("mqt"."milk_weight_id" = "mw"."id")))
     LEFT JOIN "public"."milk_producers" "mp" ON (("mp"."id" = COALESCE("mct"."producer_id", "mqt"."producer_id"))))
  ORDER BY "mw"."date" DESC, "mw"."session_type", "mw"."measurement_timestamp" DESC;


ALTER VIEW "public"."milk_data_combined" OWNER TO "postgres";

--
-- Name: VIEW "milk_data_combined"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON VIEW "public"."milk_data_combined" IS 'Combines milk weights with their linked composition and quality test results. Shows all weight records with their associated laboratory test data.';


--
-- Name: milk_production; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."milk_production" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "animal_id" "uuid" NOT NULL,
    "measurement_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "measurement_time" time without time zone DEFAULT CURRENT_TIME NOT NULL,
    "milk_quantity" numeric(10,2) NOT NULL,
    "milk_temperature" numeric(5,2),
    "session_type" "text" DEFAULT 'morning'::"text",
    "milking_duration" integer,
    "flow_rate" numeric(10,2),
    "conductivity" numeric(10,2),
    "scale_device_id" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "milk_production_milk_quantity_check" CHECK (("milk_quantity" >= (0)::numeric)),
    CONSTRAINT "milk_production_milking_duration_check" CHECK (("milking_duration" >= 0)),
    CONSTRAINT "milk_production_session_type_check" CHECK (("session_type" = ANY (ARRAY['morning'::"text", 'afternoon'::"text", 'evening'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."milk_production" OWNER TO "postgres";

--
-- Name: milk_scrape_sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."milk_scrape_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "scraped_at" timestamp with time zone NOT NULL,
    "url" "text" NOT NULL,
    "date_from" "date" NOT NULL,
    "date_to" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."milk_scrape_sessions" OWNER TO "postgres";

--
-- Name: milk_test_summaries; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."milk_test_summaries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "producer_id" "uuid",
    "scrape_session_id" "uuid",
    "summary_type" "text" NOT NULL,
    "label" "text" NOT NULL,
    "test_type" "text" NOT NULL,
    "data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "milk_test_summaries_summary_type_check" CHECK (("summary_type" = ANY (ARRAY['gamintojo'::"text", 'punktas'::"text"]))),
    CONSTRAINT "milk_test_summaries_test_type_check" CHECK (("test_type" = ANY (ARRAY['composition'::"text", 'quality'::"text"])))
);


ALTER TABLE "public"."milk_test_summaries" OWNER TO "postgres";

--
-- Name: milk_tests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."milk_tests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "animal_id" "uuid" NOT NULL,
    "test_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "sample_date" "date" NOT NULL,
    "sample_session" "text",
    "fat_percentage" numeric(5,2),
    "protein_percentage" numeric(5,2),
    "lactose_percentage" numeric(5,2),
    "somatic_cell_count" integer,
    "bacteria_count" integer,
    "urea_level" numeric(10,2),
    "ph_level" numeric(4,2),
    "freezing_point" numeric(5,3),
    "total_solids" numeric(5,2),
    "test_status" "text" DEFAULT 'pending'::"text",
    "lab_name" "text",
    "lab_reference" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "milk_tests_bacteria_count_check" CHECK (("bacteria_count" >= 0)),
    CONSTRAINT "milk_tests_fat_percentage_check" CHECK ((("fat_percentage" >= (0)::numeric) AND ("fat_percentage" <= (100)::numeric))),
    CONSTRAINT "milk_tests_lactose_percentage_check" CHECK ((("lactose_percentage" >= (0)::numeric) AND ("lactose_percentage" <= (100)::numeric))),
    CONSTRAINT "milk_tests_ph_level_check" CHECK ((("ph_level" >= (0)::numeric) AND ("ph_level" <= (14)::numeric))),
    CONSTRAINT "milk_tests_protein_percentage_check" CHECK ((("protein_percentage" >= (0)::numeric) AND ("protein_percentage" <= (100)::numeric))),
    CONSTRAINT "milk_tests_sample_session_check" CHECK (("sample_session" = ANY (ARRAY['morning'::"text", 'afternoon'::"text", 'evening'::"text", 'composite'::"text", 'other'::"text"]))),
    CONSTRAINT "milk_tests_somatic_cell_count_check" CHECK (("somatic_cell_count" >= 0)),
    CONSTRAINT "milk_tests_test_status_check" CHECK (("test_status" = ANY (ARRAY['pending'::"text", 'completed'::"text", 'requires_attention'::"text"]))),
    CONSTRAINT "milk_tests_total_solids_check" CHECK ((("total_solids" >= (0)::numeric) AND ("total_solids" <= (100)::numeric)))
);


ALTER TABLE "public"."milk_tests" OWNER TO "postgres";

--
-- Name: ppe_issuance_records; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."ppe_issuance_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ppe_item_id" "uuid",
    "product_id" "uuid",
    "employee_id" "uuid",
    "issue_date" "date" NOT NULL,
    "quantity_issued" integer NOT NULL,
    "expected_return_date" "date",
    "actual_return_date" "date",
    "condition_on_return" "text",
    "notes" "text",
    "issued_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ppe_issuance_records" OWNER TO "postgres";

--
-- Name: ppe_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."ppe_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid",
    "ppe_type" "text" NOT NULL,
    "size" "text",
    "quantity_on_hand" integer DEFAULT 0,
    "min_stock_level" integer DEFAULT 0,
    "location_id" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ppe_items" OWNER TO "postgres";

--
-- Name: product_quality_reviews; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."product_quality_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "rating" integer NOT NULL,
    "review_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "comment" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "product_quality_reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."product_quality_reviews" OWNER TO "postgres";

--
-- Name: product_quality_schedules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."product_quality_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "interval_value" integer NOT NULL,
    "interval_type" "text" NOT NULL,
    "last_checked_date" "date",
    "next_due_date" "date",
    "notes" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    CONSTRAINT "product_quality_schedules_interval_type_check" CHECK (("interval_type" = ANY (ARRAY['days'::"text", 'months'::"text", 'years'::"text"]))),
    CONSTRAINT "product_quality_schedules_interval_value_check" CHECK (("interval_value" > 0))
);


ALTER TABLE "public"."product_quality_schedules" OWNER TO "postgres";

--
-- Name: products; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "category" "public"."product_category" NOT NULL,
    "primary_pack_unit" "public"."unit" NOT NULL,
    "primary_pack_size" numeric,
    "active_substance" "text",
    "registration_code" "text",
    "dosage_notes" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "withdrawal_days_meat" integer,
    "withdrawal_days_milk" integer,
    "subcategory" "text",
    "subcategory_2" "text",
    "package_weight_g" numeric(10,2),
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "products_package_weight_g_check" CHECK (("package_weight_g" > (0)::numeric))
);


ALTER TABLE "public"."products" OWNER TO "postgres";

--
-- Name: COLUMN "products"."package_weight_g"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."products"."package_weight_g" IS 'Empty package weight in grams. Used for automatic medical waste generation when batch is fully depleted.';


--
-- Name: shared_notepad; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."shared_notepad" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "content" "text" DEFAULT ''::"text" NOT NULL,
    "last_edited_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."shared_notepad" OWNER TO "postgres";

--
-- Name: usage_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."usage_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "treatment_id" "uuid",
    "product_id" "uuid" NOT NULL,
    "batch_id" "uuid" NOT NULL,
    "qty" numeric NOT NULL,
    "unit" "public"."unit" NOT NULL,
    "purpose" "text" DEFAULT 'treatment'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "teat" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "vaccination_id" "uuid",
    "biocide_usage_id" "uuid",
    CONSTRAINT "usage_items_qty_check" CHECK (("qty" > (0)::numeric)),
    CONSTRAINT "usage_items_source_check" CHECK (((("treatment_id" IS NOT NULL) AND ("vaccination_id" IS NULL) AND ("biocide_usage_id" IS NULL)) OR (("treatment_id" IS NULL) AND ("vaccination_id" IS NOT NULL) AND ("biocide_usage_id" IS NULL)) OR (("treatment_id" IS NULL) AND ("vaccination_id" IS NULL) AND ("biocide_usage_id" IS NOT NULL)))),
    CONSTRAINT "usage_items_teat_check" CHECK (("teat" = ANY (ARRAY['d1'::"text", 'd2'::"text", 'k1'::"text", 'k2'::"text"])))
);


ALTER TABLE "public"."usage_items" OWNER TO "postgres";

--
-- Name: COLUMN "usage_items"."biocide_usage_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."usage_items"."biocide_usage_id" IS 'Links to biocide_usage record for prevention/biocide product usage tracking';


--
-- Name: CONSTRAINT "usage_items_source_check" ON "usage_items"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON CONSTRAINT "usage_items_source_check" ON "public"."usage_items" IS 'Ensures usage_items are linked to exactly one source: treatment, vaccination, or biocide_usage';


--
-- Name: stock_by_batch; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."stock_by_batch" AS
 SELECT "b"."id" AS "batch_id",
    "p"."id" AS "product_id",
    "b"."qty_left" AS "on_hand",
    "b"."expiry_date",
    "b"."lot",
    "b"."mfg_date",
    "b"."batch_number",
    "b"."status",
    "p"."name" AS "product_name",
    "p"."category" AS "product_category",
    "b"."received_qty",
    COALESCE("sum"("ui"."qty"), (0)::numeric) AS "total_used",
    "b"."created_at",
        CASE
            WHEN ("b"."expiry_date" < CURRENT_DATE) THEN 'Expired'::"text"
            WHEN ("b"."qty_left" <= (0)::numeric) THEN 'Depleted'::"text"
            WHEN ("b"."qty_left" < ("b"."received_qty" * 0.2)) THEN 'Low Stock'::"text"
            ELSE 'Available'::"text"
        END AS "stock_status"
   FROM (("public"."batches" "b"
     JOIN "public"."products" "p" ON (("b"."product_id" = "p"."id")))
     LEFT JOIN "public"."usage_items" "ui" ON (("ui"."batch_id" = "b"."id")))
  GROUP BY "b"."id", "b"."batch_number", "b"."lot", "b"."status", "p"."id", "p"."name", "p"."category", "b"."received_qty", "b"."qty_left", "b"."expiry_date", "b"."mfg_date", "b"."created_at"
  ORDER BY "b"."created_at" DESC;


ALTER VIEW "public"."stock_by_batch" OWNER TO "postgres";

--
-- Name: VIEW "stock_by_batch"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON VIEW "public"."stock_by_batch" IS 'Consolidated view of stock levels by batch with usage tracking and backward-compatible on_hand column';


--
-- Name: stock_by_product; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."stock_by_product" AS
 SELECT "product_id",
    "product_name" AS "name",
    "product_category" AS "category",
    "sum"("on_hand") AS "on_hand"
   FROM "public"."stock_by_batch"
  GROUP BY "product_id", "product_name", "product_category";


ALTER VIEW "public"."stock_by_product" OWNER TO "postgres";

--
-- Name: VIEW "stock_by_product"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON VIEW "public"."stock_by_product" IS 'Aggregated stock levels by product';


--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."suppliers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "code" "text",
    "vat_code" "text",
    "phone" "text",
    "email" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."suppliers" OWNER TO "postgres";

--
-- Name: synchronization_steps; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."synchronization_steps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "synchronization_id" "uuid" NOT NULL,
    "step_number" integer NOT NULL,
    "step_name" "text" NOT NULL,
    "scheduled_date" "date" NOT NULL,
    "is_evening" boolean DEFAULT false,
    "medication_product_id" "uuid",
    "dosage" numeric(10,2),
    "dosage_unit" "text",
    "completed" boolean DEFAULT false,
    "completed_at" timestamp with time zone,
    "visit_id" "uuid",
    "batch_id" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."synchronization_steps" OWNER TO "postgres";

--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."system_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "setting_key" "text" NOT NULL,
    "setting_value" "text" NOT NULL,
    "setting_type" "text" NOT NULL,
    "description" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "updated_by" "uuid",
    CONSTRAINT "system_settings_setting_type_check" CHECK (("setting_type" = ANY (ARRAY['number'::"text", 'text'::"text", 'boolean'::"text"])))
);


ALTER TABLE "public"."system_settings" OWNER TO "postgres";

--
-- Name: teat_status; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."teat_status" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "animal_id" "uuid" NOT NULL,
    "teat_position" "text" NOT NULL,
    "is_disabled" boolean DEFAULT false,
    "disabled_date" "date",
    "disabled_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "teat_status_teat_position_check" CHECK (("teat_position" = ANY (ARRAY['d1'::"text", 'd2'::"text", 'k1'::"text", 'k2'::"text"])))
);


ALTER TABLE "public"."teat_status" OWNER TO "postgres";

--
-- Name: tool_movements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."tool_movements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tool_id" "uuid",
    "movement_type" "text" NOT NULL,
    "movement_date" timestamp with time zone DEFAULT "now"(),
    "from_holder" "uuid",
    "to_holder" "uuid",
    "from_location_id" "uuid",
    "to_location_id" "uuid",
    "notes" "text",
    "recorded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."tool_movements" OWNER TO "postgres";

--
-- Name: tools; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."tools" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tool_number" "text" NOT NULL,
    "product_id" "uuid",
    "type" "text" NOT NULL,
    "serial_number" "text",
    "condition" "text" DEFAULT 'good'::"text",
    "purchase_date" "date",
    "purchase_price" numeric,
    "current_holder" "uuid",
    "current_location_id" "uuid",
    "is_available" boolean DEFAULT true,
    "requires_certification" boolean DEFAULT false,
    "calibration_due_date" "date",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "name" "text"
);


ALTER TABLE "public"."tools" OWNER TO "postgres";

--
-- Name: tool_parts_usage; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."tool_parts_usage" AS
 SELECT "t"."id" AS "tool_id",
    "t"."name" AS "tool_name",
    "t"."type" AS "tool_type",
    "t"."serial_number",
    "ei"."invoice_number",
    "ei"."invoice_date",
    "ei"."supplier_name",
    "ep"."name" AS "product_name",
    "ep"."product_code",
    "eii"."description" AS "item_description",
    "eii"."quantity",
    "eii"."unit_price",
    "eii"."total_price",
    "eia"."notes" AS "assignment_notes",
    "eia"."assigned_at",
    "u"."full_name" AS "assigned_by_name"
   FROM ((((("public"."equipment_invoice_item_assignments" "eia"
     JOIN "public"."equipment_invoice_items" "eii" ON (("eii"."id" = "eia"."invoice_item_id")))
     JOIN "public"."equipment_invoices" "ei" ON (("ei"."id" = "eii"."invoice_id")))
     LEFT JOIN "public"."equipment_products" "ep" ON (("ep"."id" = "eii"."product_id")))
     LEFT JOIN "public"."tools" "t" ON (("t"."id" = "eia"."tool_id")))
     LEFT JOIN "public"."users" "u" ON (("u"."id" = "eia"."assigned_by")))
  WHERE ("eia"."assignment_type" = 'tool'::"text")
  ORDER BY "t"."name", "ei"."invoice_date" DESC;


ALTER VIEW "public"."tool_parts_usage" OWNER TO "postgres";

--
-- Name: treatment_courses; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."treatment_courses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "treatment_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "batch_id" "uuid",
    "total_dose" numeric,
    "days" integer NOT NULL,
    "daily_dose" numeric,
    "unit" "public"."unit" NOT NULL,
    "start_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "doses_administered" integer DEFAULT 0,
    "status" "text" DEFAULT 'active'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "teat" "text",
    "medication_schedule_flexible" boolean DEFAULT false,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "treatment_courses_daily_dose_check" CHECK (("daily_dose" > (0)::numeric)),
    CONSTRAINT "treatment_courses_days_check" CHECK (("days" > 0)),
    CONSTRAINT "treatment_courses_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'completed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "treatment_courses_teat_check" CHECK (("teat" = ANY (ARRAY['d1'::"text", 'd2'::"text", 'k1'::"text", 'k2'::"text"]))),
    CONSTRAINT "treatment_courses_total_dose_check" CHECK (("total_dose" > (0)::numeric))
);


ALTER TABLE "public"."treatment_courses" OWNER TO "postgres";

--
-- Name: COLUMN "treatment_courses"."batch_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."treatment_courses"."batch_id" IS 'Batch ID for the medication used in this course. NULL when course is planned but batch not yet selected (batch will be selected per visit). Populated when batch is selected upfront (legacy courses or immediate treatments).';


--
-- Name: COLUMN "treatment_courses"."total_dose"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."treatment_courses"."total_dose" IS 'Total dose for course. NULL when using manual entry per visit.';


--
-- Name: COLUMN "treatment_courses"."daily_dose"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."treatment_courses"."daily_dose" IS 'Daily dose for course. NULL when using manual entry per visit.';


--
-- Name: COLUMN "treatment_courses"."medication_schedule_flexible"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."treatment_courses"."medication_schedule_flexible" IS 'True if course uses flexible per-date medication scheduling';


--
-- Name: treatments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."treatments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reg_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "first_symptoms_date" "date",
    "animal_condition" "text",
    "tests" "text",
    "clinical_diagnosis" "text",
    "outcome" "text",
    "services" "text",
    "withdrawal_until" "date",
    "vet_name" "text",
    "vet_signature_path" "text",
    "notes" "text",
    "animal_id" "uuid",
    "disease_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "mastitis_teat" "text",
    "mastitis_type" "text",
    "syringe_count" integer,
    "withdrawal_until_milk" "date",
    "withdrawal_until_meat" "date",
    "visit_id" "uuid",
    "creates_future_visits" boolean DEFAULT false,
    "affected_teats" "jsonb" DEFAULT '[]'::"jsonb",
    "sick_teats" "jsonb" DEFAULT '[]'::"jsonb",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "disabled_teats" "text"[],
    CONSTRAINT "treatments_mastitis_teat_check" CHECK (("mastitis_teat" = ANY (ARRAY['LF'::"text", 'RF'::"text", 'LR'::"text", 'RR'::"text", NULL::"text"]))),
    CONSTRAINT "treatments_mastitis_type_check" CHECK (("mastitis_type" = ANY (ARRAY['new'::"text", 'recurring'::"text", NULL::"text"])))
);


ALTER TABLE "public"."treatments" OWNER TO "postgres";

--
-- Name: COLUMN "treatments"."disabled_teats"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."treatments"."disabled_teats" IS 'Array of teat positions that were disabled during this treatment';


--
-- Name: treatment_history_view; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."treatment_history_view" AS
 SELECT "t"."id" AS "treatment_id",
    "t"."reg_date",
    "t"."first_symptoms_date",
    "t"."animal_condition",
    "t"."tests",
    "t"."clinical_diagnosis",
    "t"."outcome",
    "t"."services",
    "t"."vet_name",
    "t"."notes",
    "t"."mastitis_teat",
    "t"."mastitis_type",
    "t"."syringe_count",
    "t"."withdrawal_until_meat",
    "t"."withdrawal_until_milk",
    "t"."created_at",
    "a"."id" AS "animal_id",
    "a"."tag_no" AS "animal_tag",
    "a"."species",
    "a"."holder_name" AS "owner_name",
    "d"."id" AS "disease_id",
    "d"."code" AS "disease_code",
    "d"."name" AS "disease_name",
    ( SELECT "json_agg"("json_build_object"('product_name', "p"."name", 'quantity', "ui"."qty", 'unit', "ui"."unit", 'batch_lot', "b"."lot")) AS "json_agg"
           FROM (("public"."usage_items" "ui"
             LEFT JOIN "public"."products" "p" ON (("ui"."product_id" = "p"."id")))
             LEFT JOIN "public"."batches" "b" ON (("ui"."batch_id" = "b"."id")))
          WHERE ("ui"."treatment_id" = "t"."id")) AS "products_used",
    ( SELECT "json_agg"("json_build_object"('course_id', "tc"."id", 'product_name', "p"."name", 'total_dose', "tc"."total_dose", 'daily_dose', "tc"."daily_dose", 'days', "tc"."days", 'unit', "tc"."unit", 'start_date', "tc"."start_date", 'doses_administered', "tc"."doses_administered", 'status', "tc"."status", 'batch_lot', "b"."lot")) AS "json_agg"
           FROM (("public"."treatment_courses" "tc"
             LEFT JOIN "public"."products" "p" ON (("tc"."product_id" = "p"."id")))
             LEFT JOIN "public"."batches" "b" ON (("tc"."batch_id" = "b"."id")))
          WHERE ("tc"."treatment_id" = "t"."id")) AS "treatment_courses"
   FROM (("public"."treatments" "t"
     LEFT JOIN "public"."animals" "a" ON (("t"."animal_id" = "a"."id")))
     LEFT JOIN "public"."diseases" "d" ON (("t"."disease_id" = "d"."id")))
  ORDER BY "t"."reg_date" DESC, "t"."created_at" DESC;


ALTER VIEW "public"."treatment_history_view" OWNER TO "postgres";

--
-- Name: treatment_milk_loss_summary; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."treatment_milk_loss_summary" AS
 SELECT "t"."id" AS "treatment_id",
    "t"."animal_id",
    "a"."tag_no" AS "animal_tag",
    "t"."reg_date" AS "treatment_date",
    "t"."withdrawal_until_milk",
    "t"."withdrawal_until_meat",
    "t"."clinical_diagnosis",
    "t"."vet_name",
    "ml"."withdrawal_days",
    "ml"."safety_days",
    "ml"."total_loss_days",
    "ml"."avg_daily_milk_kg",
    "ml"."total_milk_lost_kg",
    "ml"."milk_price_eur_per_kg",
    "ml"."total_value_lost_eur",
    COALESCE(( SELECT "json_agg"("json_build_object"('product_id', "ui"."product_id", 'product_name', "p"."name", 'qty', "ui"."qty", 'unit', "ui"."unit", 'withdrawal_milk_days', "p"."withdrawal_days_milk", 'withdrawal_meat_days', "p"."withdrawal_days_meat") ORDER BY "p"."name") AS "json_agg"
           FROM ("public"."usage_items" "ui"
             JOIN "public"."products" "p" ON (("p"."id" = "ui"."product_id")))
          WHERE (("ui"."treatment_id" = "t"."id") AND ("p"."category" = 'medicines'::"public"."product_category"))), '[]'::json) AS "medications_used"
   FROM (("public"."treatments" "t"
     JOIN "public"."animals" "a" ON (("a"."id" = "t"."animal_id")))
     CROSS JOIN LATERAL "public"."calculate_treatment_milk_loss"("t"."id") "ml"("withdrawal_days", "safety_days", "total_loss_days", "avg_daily_milk_kg", "total_milk_lost_kg", "milk_price_eur_per_kg", "total_value_lost_eur", "treatment_date", "withdrawal_until", "animal_tag"))
  WHERE (("t"."withdrawal_until_milk" IS NOT NULL) AND ("ml"."total_loss_days" > 0))
  ORDER BY "t"."reg_date" DESC;


ALTER VIEW "public"."treatment_milk_loss_summary" OWNER TO "postgres";

--
-- Name: VIEW "treatment_milk_loss_summary"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON VIEW "public"."treatment_milk_loss_summary" IS 'Shows milk loss per treatment including medications used and financial impact during withdrawal period';


--
-- Name: user_audit_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."user_audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "action" "text" NOT NULL,
    "table_name" "text",
    "record_id" "uuid",
    "old_data" "jsonb",
    "new_data" "jsonb",
    "ip_address" "text",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_audit_logs" OWNER TO "postgres";

--
-- Name: vaccinations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."vaccinations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "animal_id" "uuid",
    "product_id" "uuid" NOT NULL,
    "batch_id" "uuid",
    "vaccination_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "next_booster_date" "date",
    "dose_number" integer DEFAULT 1,
    "dose_amount" numeric NOT NULL,
    "unit" "public"."unit" NOT NULL,
    "notes" "text",
    "administered_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."vaccinations" OWNER TO "postgres";

--
-- Name: vehicle_assignments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."vehicle_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vehicle_id" "uuid",
    "assigned_to" "uuid",
    "assigned_date" "date" NOT NULL,
    "return_date" "date",
    "purpose" "text",
    "starting_mileage" numeric,
    "ending_mileage" numeric,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid"
);


ALTER TABLE "public"."vehicle_assignments" OWNER TO "postgres";

--
-- Name: vehicle_service_visits; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."vehicle_service_visits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vehicle_id" "uuid" NOT NULL,
    "visit_datetime" timestamp with time zone NOT NULL,
    "visit_type" "text" DEFAULT 'planinis'::"text" NOT NULL,
    "procedures" "text"[] DEFAULT ARRAY[]::"text"[],
    "odometer_reading" numeric(10,2),
    "engine_hours" numeric(10,2),
    "status" "text" DEFAULT 'Planuojamas'::"text" NOT NULL,
    "notes" "text",
    "mechanic_name" "text",
    "next_visit_required" boolean DEFAULT false,
    "next_visit_date" timestamp with time zone,
    "cost_estimate" numeric(10,2),
    "actual_cost" numeric(10,2),
    "labor_hours" numeric(10,2),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "completed_at" timestamp with time zone,
    "completed_by" "uuid",
    CONSTRAINT "valid_status" CHECK (("status" = ANY (ARRAY['Planuojamas'::"text", 'Vykdomas'::"text", 'Baigtas'::"text", 'Atsauktas'::"text"]))),
    CONSTRAINT "valid_visit_type" CHECK (("visit_type" = ANY (ARRAY['planinis'::"text", 'neplaninis'::"text"])))
);


ALTER TABLE "public"."vehicle_service_visits" OWNER TO "postgres";

--
-- Name: vehicle_visit_parts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."vehicle_visit_parts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "visit_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "batch_id" "uuid",
    "quantity_used" numeric(10,3) NOT NULL,
    "cost_per_unit" numeric(10,2),
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid"
);


ALTER TABLE "public"."vehicle_visit_parts" OWNER TO "postgres";

--
-- Name: vehicles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."vehicles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "registration_number" "text" NOT NULL,
    "vehicle_type" "text" NOT NULL,
    "make" "text",
    "model" "text",
    "year" integer,
    "vin" "text",
    "purchase_date" "date",
    "purchase_price" numeric,
    "current_mileage" numeric DEFAULT 0,
    "current_engine_hours" numeric DEFAULT 0,
    "fuel_type" "text",
    "tank_capacity" numeric,
    "insurance_provider" "text",
    "insurance_policy_number" "text",
    "insurance_expiry_date" "date",
    "technical_inspection_due_date" "date",
    "status" "text" DEFAULT 'active'::"text",
    "assigned_to" "uuid",
    "home_location_id" "uuid",
    "notes" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "last_service_date" timestamp with time zone,
    "last_service_mileage" numeric(10,2),
    "last_service_hours" numeric(10,2)
);


ALTER TABLE "public"."vehicles" OWNER TO "postgres";

--
-- Name: work_order_parts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."work_order_parts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "work_order_id" "uuid",
    "product_id" "uuid",
    "batch_id" "uuid",
    "quantity" numeric NOT NULL,
    "unit_price" numeric NOT NULL,
    "total_price" numeric NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."work_order_parts" OWNER TO "postgres";

--
-- Name: vehicle_maintenance_cost_summary; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."vehicle_maintenance_cost_summary" AS
 SELECT "v"."id" AS "vehicle_id",
    "v"."registration_number",
    "v"."make",
    "v"."model",
    "v"."year",
    "v"."vin",
    "count"(DISTINCT "mwo"."id") FILTER (WHERE ("mwo"."status" = 'completed'::"text")) AS "completed_work_orders",
    COALESCE("sum"("mwo"."labor_cost") FILTER (WHERE ("mwo"."status" = 'completed'::"text")), (0)::numeric) AS "total_labor_cost",
    COALESCE("sum"("mwo"."parts_cost") FILTER (WHERE ("mwo"."status" = 'completed'::"text")), (0)::numeric) AS "total_work_order_parts_cost",
    COALESCE("sum"("mwo"."total_cost") FILTER (WHERE ("mwo"."status" = 'completed'::"text")), (0)::numeric) AS "total_work_order_cost",
    "count"(DISTINCT "vsv"."id") FILTER (WHERE ("vsv"."status" = 'Baigtas'::"text")) AS "completed_service_visits",
    COALESCE("sum"("vsv"."actual_cost") FILTER (WHERE ("vsv"."status" = 'Baigtas'::"text")), (0)::numeric) AS "total_service_cost",
    "count"(DISTINCT "wop"."id") AS "total_work_order_parts",
    COALESCE("sum"("wop"."total_price"), (0)::numeric) AS "work_order_parts_value",
    "count"(DISTINCT "vvp"."id") AS "total_visit_parts",
    COALESCE("sum"(("vvp"."quantity_used" * COALESCE("vvp"."cost_per_unit", (0)::numeric))), (0)::numeric) AS "visit_parts_value",
    ("count"(DISTINCT "mwo"."id") FILTER (WHERE ("mwo"."status" = 'completed'::"text")) + "count"(DISTINCT "vsv"."id") FILTER (WHERE ("vsv"."status" = 'Baigtas'::"text"))) AS "total_completed_activities",
    ("count"(DISTINCT "wop"."id") + "count"(DISTINCT "vvp"."id")) AS "total_parts_used",
    (COALESCE("sum"("mwo"."total_cost") FILTER (WHERE ("mwo"."status" = 'completed'::"text")), (0)::numeric) + COALESCE("sum"("vsv"."actual_cost") FILTER (WHERE ("vsv"."status" = 'Baigtas'::"text")), (0)::numeric)) AS "grand_total_cost"
   FROM (((("public"."vehicles" "v"
     LEFT JOIN "public"."maintenance_work_orders" "mwo" ON (("v"."id" = "mwo"."vehicle_id")))
     LEFT JOIN "public"."vehicle_service_visits" "vsv" ON (("v"."id" = "vsv"."vehicle_id")))
     LEFT JOIN "public"."work_order_parts" "wop" ON (("mwo"."id" = "wop"."work_order_id")))
     LEFT JOIN "public"."vehicle_visit_parts" "vvp" ON (("vsv"."id" = "vvp"."visit_id")))
  WHERE ("v"."is_active" = true)
  GROUP BY "v"."id", "v"."registration_number", "v"."make", "v"."model", "v"."year", "v"."vin";


ALTER VIEW "public"."vehicle_maintenance_cost_summary" OWNER TO "postgres";

--
-- Name: vehicle_cost_overview; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."vehicle_cost_overview" AS
 SELECT "count"(DISTINCT "vehicle_id") AS "total_vehicles",
    "count"(DISTINCT "vehicle_id") FILTER (WHERE ("total_completed_activities" > 0)) AS "vehicles_with_maintenance",
    "sum"("completed_work_orders") AS "total_work_orders",
    "sum"("completed_service_visits") AS "total_service_visits",
    "sum"("total_parts_used") AS "total_parts",
    "sum"("grand_total_cost") AS "total_cost",
    "avg"("grand_total_cost") FILTER (WHERE ("total_completed_activities" > 0)) AS "avg_cost_per_vehicle",
    "sum"("total_labor_cost") AS "total_labor",
    "sum"(("work_order_parts_value" + "visit_parts_value")) AS "total_parts_cost"
   FROM "public"."vehicle_maintenance_cost_summary";


ALTER VIEW "public"."vehicle_cost_overview" OWNER TO "postgres";

--
-- Name: vehicle_documents; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."vehicle_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vehicle_id" "uuid",
    "document_type" "text" NOT NULL,
    "document_name" "text",
    "issue_date" "date",
    "expiry_date" "date",
    "document_number" "text",
    "issuing_authority" "text",
    "file_url" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid"
);


ALTER TABLE "public"."vehicle_documents" OWNER TO "postgres";

--
-- Name: vehicle_fuel_records; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."vehicle_fuel_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vehicle_id" "uuid",
    "refuel_date" "date" NOT NULL,
    "odometer_reading" numeric,
    "fuel_quantity" numeric NOT NULL,
    "fuel_cost" numeric NOT NULL,
    "currency" "text" DEFAULT 'EUR'::"text",
    "fuel_type" "text",
    "location" "text",
    "is_full_tank" boolean DEFAULT false,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid"
);


ALTER TABLE "public"."vehicle_fuel_records" OWNER TO "postgres";

--
-- Name: vehicle_parts_usage; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."vehicle_parts_usage" AS
 SELECT "v"."id" AS "vehicle_id",
    "v"."registration_number",
    "v"."make",
    "v"."model",
    "v"."vehicle_type",
    "ei"."invoice_number",
    "ei"."invoice_date",
    "ei"."supplier_name",
    "ep"."name" AS "product_name",
    "ep"."product_code",
    "eii"."description" AS "item_description",
    "eii"."quantity",
    "eii"."unit_price",
    "eii"."total_price",
    "eia"."notes" AS "assignment_notes",
    "eia"."assigned_at",
    "u"."full_name" AS "assigned_by_name"
   FROM ((((("public"."equipment_invoice_item_assignments" "eia"
     JOIN "public"."equipment_invoice_items" "eii" ON (("eii"."id" = "eia"."invoice_item_id")))
     JOIN "public"."equipment_invoices" "ei" ON (("ei"."id" = "eii"."invoice_id")))
     LEFT JOIN "public"."equipment_products" "ep" ON (("ep"."id" = "eii"."product_id")))
     LEFT JOIN "public"."vehicles" "v" ON (("v"."id" = "eia"."vehicle_id")))
     LEFT JOIN "public"."users" "u" ON (("u"."id" = "eia"."assigned_by")))
  WHERE ("eia"."assignment_type" = 'vehicle'::"text")
  ORDER BY "v"."registration_number", "ei"."invoice_date" DESC;


ALTER VIEW "public"."vehicle_parts_usage" OWNER TO "postgres";

--
-- Name: vehicle_service_history; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."vehicle_service_history" AS
 SELECT "v"."id" AS "vehicle_id",
    "v"."registration_number",
    "v"."make",
    "v"."model",
    "count"(DISTINCT "vsv"."id") FILTER (WHERE ("vsv"."status" = 'Baigtas'::"text")) AS "total_services",
    "count"(DISTINCT "mwo"."id") FILTER (WHERE ("mwo"."status" = 'completed'::"text")) AS "total_work_orders",
    "sum"("vsv"."actual_cost") AS "total_service_cost",
    "sum"("mwo"."total_cost") AS "total_work_order_cost",
    "max"("vsv"."visit_datetime") FILTER (WHERE ("vsv"."status" = 'Baigtas'::"text")) AS "last_service_date",
    "sum"("vsv"."labor_hours") AS "total_labor_hours"
   FROM (("public"."vehicles" "v"
     LEFT JOIN "public"."vehicle_service_visits" "vsv" ON (("v"."id" = "vsv"."vehicle_id")))
     LEFT JOIN "public"."maintenance_work_orders" "mwo" ON (("v"."id" = "mwo"."vehicle_id")))
  GROUP BY "v"."id", "v"."registration_number", "v"."make", "v"."model";


ALTER VIEW "public"."vehicle_service_history" OWNER TO "postgres";

--
-- Name: vehicle_service_visit_details; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."vehicle_service_visit_details" AS
 SELECT "vsv"."id" AS "visit_id",
    "vsv"."vehicle_id",
    "v"."registration_number",
    "v"."make",
    "v"."model",
    "vsv"."visit_datetime",
    "vsv"."visit_type",
    "vsv"."procedures",
    "vsv"."status",
    "vsv"."odometer_reading",
    "vsv"."engine_hours",
    "vsv"."mechanic_name",
    "vsv"."labor_hours",
    "vsv"."actual_cost",
    "vsv"."notes",
    "json_agg"("json_build_object"('part_id', "vvp"."id", 'product_id', "vvp"."product_id", 'product_name', "p"."name", 'batch_id', "vvp"."batch_id", 'quantity_used', "vvp"."quantity_used", 'cost_per_unit', "vvp"."cost_per_unit", 'total_cost', ("vvp"."quantity_used" * COALESCE("vvp"."cost_per_unit", (0)::numeric)), 'notes', "vvp"."notes") ORDER BY "vvp"."created_at") FILTER (WHERE ("vvp"."id" IS NOT NULL)) AS "parts_used"
   FROM ((("public"."vehicle_service_visits" "vsv"
     JOIN "public"."vehicles" "v" ON (("vsv"."vehicle_id" = "v"."id")))
     LEFT JOIN "public"."vehicle_visit_parts" "vvp" ON (("vsv"."id" = "vvp"."visit_id")))
     LEFT JOIN "public"."products" "p" ON (("vvp"."product_id" = "p"."id")))
  GROUP BY "vsv"."id", "vsv"."vehicle_id", "v"."registration_number", "v"."make", "v"."model", "vsv"."visit_datetime", "vsv"."visit_type", "vsv"."procedures", "vsv"."status", "vsv"."odometer_reading", "vsv"."engine_hours", "vsv"."mechanic_name", "vsv"."labor_hours", "vsv"."actual_cost", "vsv"."notes";


ALTER VIEW "public"."vehicle_service_visit_details" OWNER TO "postgres";

--
-- Name: vehicle_work_order_details; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."vehicle_work_order_details" AS
 SELECT "mwo"."id" AS "work_order_id",
    "mwo"."work_order_number",
    "mwo"."vehicle_id",
    "v"."registration_number",
    "v"."make",
    "v"."model",
    "mwo"."description",
    "mwo"."status",
    "mwo"."priority",
    "mwo"."assigned_to",
    "mwo"."scheduled_date",
    "mwo"."started_date",
    "mwo"."completed_date",
    "mwo"."labor_hours",
    "mwo"."labor_cost",
    "mwo"."parts_cost",
    "mwo"."total_cost",
    "mwo"."odometer_reading",
    "mwo"."engine_hours",
    "mwo"."notes",
    "json_agg"("json_build_object"('part_id', "wop"."id", 'product_id', "wop"."product_id", 'product_name', "ep"."name", 'product_code', "ep"."product_code", 'batch_id', "wop"."batch_id", 'batch_number', "eb"."batch_number", 'quantity', "wop"."quantity", 'unit_price', "wop"."unit_price", 'total_price', "wop"."total_price", 'invoice_number', "ei"."invoice_number", 'supplier_name', "ei"."supplier_name", 'notes', "wop"."notes") ORDER BY "wop"."created_at") FILTER (WHERE ("wop"."id" IS NOT NULL)) AS "parts_used"
   FROM ((((("public"."maintenance_work_orders" "mwo"
     JOIN "public"."vehicles" "v" ON (("mwo"."vehicle_id" = "v"."id")))
     LEFT JOIN "public"."work_order_parts" "wop" ON (("mwo"."id" = "wop"."work_order_id")))
     LEFT JOIN "public"."equipment_products" "ep" ON (("wop"."product_id" = "ep"."id")))
     LEFT JOIN "public"."equipment_batches" "eb" ON (("wop"."batch_id" = "eb"."id")))
     LEFT JOIN "public"."equipment_invoices" "ei" ON (("eb"."invoice_id" = "ei"."id")))
  GROUP BY "mwo"."id", "mwo"."work_order_number", "mwo"."vehicle_id", "v"."registration_number", "v"."make", "v"."model", "mwo"."description", "mwo"."status", "mwo"."priority", "mwo"."assigned_to", "mwo"."scheduled_date", "mwo"."started_date", "mwo"."completed_date", "mwo"."labor_hours", "mwo"."labor_cost", "mwo"."parts_cost", "mwo"."total_cost", "mwo"."odometer_reading", "mwo"."engine_hours", "mwo"."notes";


ALTER VIEW "public"."vehicle_work_order_details" OWNER TO "postgres";

--
-- Name: vet_analytics_summary; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."vet_analytics_summary" AS
 SELECT "av"."vet_name",
    "count"(DISTINCT "av"."id") AS "total_visits",
    "count"(DISTINCT
        CASE
            WHEN ('Gydymas'::"text" = ANY ("av"."procedures")) THEN "av"."id"
            ELSE NULL::"uuid"
        END) AS "treatment_visits",
    "count"(DISTINCT
        CASE
            WHEN ('Vakcinavimas'::"text" = ANY ("av"."procedures")) THEN "av"."id"
            ELSE NULL::"uuid"
        END) AS "vaccination_visits",
    "count"(DISTINCT
        CASE
            WHEN ('Prevencija'::"text" = ANY ("av"."procedures")) THEN "av"."id"
            ELSE NULL::"uuid"
        END) AS "prevention_visits",
    "count"(DISTINCT "av"."animal_id") AS "unique_animals_treated",
    "min"("av"."visit_datetime") AS "first_visit_date",
    "max"("av"."visit_datetime") AS "last_visit_date",
    "count"(DISTINCT "date"("av"."visit_datetime")) AS "active_days",
    (COALESCE("sum"("tm"."total_treatments"), (0)::numeric))::integer AS "total_treatments_administered"
   FROM ("public"."animal_visits" "av"
     LEFT JOIN ( SELECT "t"."visit_id",
            "count"(*) AS "total_treatments"
           FROM "public"."treatments" "t"
          GROUP BY "t"."visit_id") "tm" ON (("tm"."visit_id" = "av"."id")))
  WHERE (("av"."vet_name" IS NOT NULL) AND ("av"."vet_name" <> ''::"text"))
  GROUP BY "av"."vet_name"
  ORDER BY ("count"(DISTINCT "av"."id")) DESC;


ALTER VIEW "public"."vet_analytics_summary" OWNER TO "postgres";

--
-- Name: vw_animal_cost_analytics; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."vw_animal_cost_analytics" AS
 WITH "treatment_costs" AS (
         SELECT "t"."animal_id",
            "count"(DISTINCT "t"."id") AS "treatment_count",
            (COALESCE("sum"(("ui"."qty" * COALESCE(("b"."purchase_price" / NULLIF("b"."received_qty", (0)::numeric)), (0)::numeric))), (0)::numeric) + COALESCE("sum"(("tc_1"."total_dose" * COALESCE(("bc"."purchase_price" / NULLIF("bc"."received_qty", (0)::numeric)), (0)::numeric))), (0)::numeric)) AS "medicine_cost"
           FROM (((("public"."treatments" "t"
             LEFT JOIN "public"."usage_items" "ui" ON (("ui"."treatment_id" = "t"."id")))
             LEFT JOIN "public"."batches" "b" ON (("b"."id" = "ui"."batch_id")))
             LEFT JOIN "public"."treatment_courses" "tc_1" ON (("tc_1"."treatment_id" = "t"."id")))
             LEFT JOIN "public"."batches" "bc" ON (("bc"."id" = "tc_1"."batch_id")))
          WHERE ("t"."animal_id" IS NOT NULL)
          GROUP BY "t"."animal_id"
        ), "vaccination_costs" AS (
         SELECT "v"."animal_id",
            "count"("v"."id") AS "vaccination_count",
            0 AS "vaccine_cost"
           FROM "public"."vaccinations" "v"
          WHERE ("v"."animal_id" IS NOT NULL)
          GROUP BY "v"."animal_id"
        ), "visit_costs" AS (
         SELECT "av"."animal_id",
            "count"("av"."id") AS "visit_count",
            ("count"("av"."id") * 10) AS "visit_cost"
           FROM "public"."animal_visits" "av"
          WHERE ("av"."animal_id" IS NOT NULL)
          GROUP BY "av"."animal_id"
        )
 SELECT "a"."id" AS "animal_id",
    "a"."tag_no",
    COALESCE("tc"."treatment_count", (0)::bigint) AS "treatment_count",
    COALESCE("tc"."medicine_cost", (0)::numeric) AS "medicine_cost",
    COALESCE("vc"."vaccination_count", (0)::bigint) AS "vaccination_count",
    COALESCE("vc"."vaccine_cost", 0) AS "vaccine_cost",
    COALESCE("vsc"."visit_count", (0)::bigint) AS "visit_count",
    COALESCE("vsc"."visit_cost", (0)::bigint) AS "visit_cost",
    ((COALESCE("tc"."medicine_cost", (0)::numeric) + (COALESCE("vc"."vaccine_cost", 0))::numeric) + (COALESCE("vsc"."visit_cost", (0)::bigint))::numeric) AS "total_cost"
   FROM ((("public"."animals" "a"
     LEFT JOIN "treatment_costs" "tc" ON (("tc"."animal_id" = "a"."id")))
     LEFT JOIN "vaccination_costs" "vc" ON (("vc"."animal_id" = "a"."id")))
     LEFT JOIN "visit_costs" "vsc" ON (("vsc"."animal_id" = "a"."id")));


ALTER VIEW "public"."vw_animal_cost_analytics" OWNER TO "postgres";

--
-- Name: vw_animal_product_usage; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."vw_animal_product_usage" AS
 WITH "treatment_products" AS (
         SELECT "t"."animal_id",
            "p"."id" AS "product_id",
            "p"."name" AS "product_name",
            "p"."category",
            "p"."primary_pack_unit" AS "unit",
            "count"("ui"."id") AS "usage_count",
            "sum"("ui"."qty") AS "total_quantity",
            "sum"(("ui"."qty" * COALESCE(("b"."purchase_price" / NULLIF("b"."received_qty", (0)::numeric)), (0)::numeric))) AS "total_cost"
           FROM ((("public"."treatments" "t"
             JOIN "public"."usage_items" "ui" ON (("ui"."treatment_id" = "t"."id")))
             JOIN "public"."products" "p" ON (("p"."id" = "ui"."product_id")))
             LEFT JOIN "public"."batches" "b" ON (("b"."id" = "ui"."batch_id")))
          WHERE ("t"."animal_id" IS NOT NULL)
          GROUP BY "t"."animal_id", "p"."id", "p"."name", "p"."category", "p"."primary_pack_unit"
        UNION ALL
         SELECT "t"."animal_id",
            "p"."id" AS "product_id",
            "p"."name" AS "product_name",
            "p"."category",
            "p"."primary_pack_unit" AS "unit",
            "count"("tc"."id") AS "usage_count",
            "sum"("tc"."total_dose") AS "total_quantity",
            "sum"(("tc"."total_dose" * COALESCE(("bc"."purchase_price" / NULLIF("bc"."received_qty", (0)::numeric)), (0)::numeric))) AS "total_cost"
           FROM ((("public"."treatments" "t"
             JOIN "public"."treatment_courses" "tc" ON (("tc"."treatment_id" = "t"."id")))
             JOIN "public"."products" "p" ON (("p"."id" = "tc"."product_id")))
             LEFT JOIN "public"."batches" "bc" ON (("bc"."id" = "tc"."batch_id")))
          WHERE ("t"."animal_id" IS NOT NULL)
          GROUP BY "t"."animal_id", "p"."id", "p"."name", "p"."category", "p"."primary_pack_unit"
        ), "combined_products" AS (
         SELECT "treatment_products"."animal_id",
            "treatment_products"."product_id",
            "treatment_products"."product_name",
            "treatment_products"."category",
            "treatment_products"."unit",
            "sum"("treatment_products"."usage_count") AS "usage_count",
            "sum"("treatment_products"."total_quantity") AS "total_quantity",
            "sum"("treatment_products"."total_cost") AS "total_cost"
           FROM "treatment_products"
          GROUP BY "treatment_products"."animal_id", "treatment_products"."product_id", "treatment_products"."product_name", "treatment_products"."category", "treatment_products"."unit"
        )
 SELECT "animal_id",
    "product_id",
    "product_name",
    "category",
    "unit",
    "usage_count",
    "total_quantity",
    "total_cost",
    "row_number"() OVER (PARTITION BY "animal_id" ORDER BY "usage_count" DESC) AS "usage_rank"
   FROM "combined_products";


ALTER VIEW "public"."vw_animal_product_usage" OWNER TO "postgres";

--
-- Name: vw_animal_treatment_outcomes; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."vw_animal_treatment_outcomes" AS
 SELECT "t"."animal_id",
    "a"."tag_no",
    "count"(*) AS "total_treatments",
    "count"(
        CASE
            WHEN ("t"."outcome" = 'recovered'::"text") THEN 1
            ELSE NULL::integer
        END) AS "recovered_count",
    "count"(
        CASE
            WHEN ("t"."outcome" = 'ongoing'::"text") THEN 1
            ELSE NULL::integer
        END) AS "ongoing_count",
    "count"(
        CASE
            WHEN ("t"."outcome" = 'deceased'::"text") THEN 1
            ELSE NULL::integer
        END) AS "deceased_count",
    "count"(
        CASE
            WHEN ("t"."outcome" IS NULL) THEN 1
            ELSE NULL::integer
        END) AS "unknown_outcome_count",
    "round"(((("count"(
        CASE
            WHEN ("t"."outcome" = 'recovered'::"text") THEN 1
            ELSE NULL::integer
        END))::numeric / (NULLIF("count"(*), 0))::numeric) * (100)::numeric), 1) AS "recovery_rate_percent"
   FROM ("public"."treatments" "t"
     JOIN "public"."animals" "a" ON (("a"."id" = "t"."animal_id")))
  GROUP BY "t"."animal_id", "a"."tag_no";


ALTER VIEW "public"."vw_animal_treatment_outcomes" OWNER TO "postgres";

--
-- Name: vw_animal_visit_analytics; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."vw_animal_visit_analytics" AS
 SELECT "av"."animal_id",
    "a"."tag_no",
    "count"(*) AS "total_visits",
    "count"(
        CASE
            WHEN ("av"."status" = 'Užbaigtas'::"text") THEN 1
            ELSE NULL::integer
        END) AS "completed_visits",
    "count"(
        CASE
            WHEN ("av"."status" = 'Planuojamas'::"text") THEN 1
            ELSE NULL::integer
        END) AS "planned_visits",
    "count"(
        CASE
            WHEN ("av"."status" = 'Atšauktas'::"text") THEN 1
            ELSE NULL::integer
        END) AS "cancelled_visits",
    "count"(
        CASE
            WHEN ("av"."temperature" IS NOT NULL) THEN 1
            ELSE NULL::integer
        END) AS "temperature_checks",
    "round"("avg"("av"."temperature"), 1) AS "avg_temperature",
    "max"("av"."temperature") AS "max_temperature",
    "count"(
        CASE
            WHEN "av"."treatment_required" THEN 1
            ELSE NULL::integer
        END) AS "treatments_required_count",
    "min"("av"."visit_datetime") AS "first_visit",
    "max"("av"."visit_datetime") AS "last_visit"
   FROM ("public"."animal_visits" "av"
     JOIN "public"."animals" "a" ON (("a"."id" = "av"."animal_id")))
  GROUP BY "av"."animal_id", "a"."tag_no";


ALTER VIEW "public"."vw_animal_visit_analytics" OWNER TO "postgres";

--
-- Name: vw_biocide_journal; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."vw_biocide_journal" AS
 SELECT "bu"."id" AS "entry_id",
    "bu"."product_id",
    "bu"."use_date",
    "p"."name" AS "biocide_name",
    "p"."registration_code",
    "p"."active_substance",
    "bu"."purpose",
    "bu"."work_scope",
    "bu"."qty" AS "quantity_used",
    "bu"."unit",
    "b"."lot" AS "batch_number",
    "b"."expiry_date" AS "batch_expiry",
    "bu"."used_by_name" AS "applied_by",
    "bu"."created_at" AS "logged_at"
   FROM (("public"."biocide_usage" "bu"
     JOIN "public"."products" "p" ON (("bu"."product_id" = "p"."id")))
     LEFT JOIN "public"."batches" "b" ON (("bu"."batch_id" = "b"."id")))
  WHERE ("p"."category" = 'biocide'::"public"."product_category")
  ORDER BY "bu"."use_date" DESC;


ALTER VIEW "public"."vw_biocide_journal" OWNER TO "postgres";

--
-- Name: vw_course_schedules; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."vw_course_schedules" AS
 SELECT "tc"."id" AS "course_id",
    "tc"."treatment_id",
    "t"."animal_id",
    "a"."tag_no",
    "tc"."days" AS "total_days",
    "tc"."start_date",
    "tc"."medication_schedule_flexible",
    "count"(DISTINCT "cms"."scheduled_date") AS "scheduled_dates",
    "count"(DISTINCT "cms"."product_id") AS "unique_medications",
    "count"(DISTINCT "av"."id") FILTER (WHERE ("av"."status" = 'Baigtas'::"text")) AS "completed_visits",
    "count"(DISTINCT "av"."id") FILTER (WHERE (("av"."status" <> 'Baigtas'::"text") AND ("av"."status" <> 'Atšauktas'::"text"))) AS "pending_visits",
    "tc"."status" AS "course_status"
   FROM (((("public"."treatment_courses" "tc"
     JOIN "public"."treatments" "t" ON (("tc"."treatment_id" = "t"."id")))
     JOIN "public"."animals" "a" ON (("t"."animal_id" = "a"."id")))
     LEFT JOIN "public"."course_medication_schedules" "cms" ON (("tc"."id" = "cms"."course_id")))
     LEFT JOIN "public"."animal_visits" "av" ON (("tc"."id" = "av"."course_id")))
  WHERE ("tc"."medication_schedule_flexible" = true)
  GROUP BY "tc"."id", "tc"."treatment_id", "t"."animal_id", "a"."tag_no", "tc"."days", "tc"."start_date", "tc"."medication_schedule_flexible", "tc"."status";


ALTER VIEW "public"."vw_course_schedules" OWNER TO "postgres";

--
-- Name: VIEW "vw_course_schedules"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON VIEW "public"."vw_course_schedules" IS 'Overview of all flexible medication courses with progress tracking';


--
-- Name: vw_medical_waste; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."vw_medical_waste" AS
 SELECT "id" AS "entry_id",
    "waste_code",
    "name" AS "waste_type",
    "period" AS "reporting_period",
    "date" AS "record_date",
    "qty_generated" AS "quantity_generated",
    "qty_transferred" AS "quantity_transferred",
    "carrier" AS "waste_carrier",
    "processor" AS "waste_processor",
    "transfer_date",
    "doc_no" AS "transfer_document",
    "responsible" AS "responsible_person",
    "created_at" AS "logged_at"
   FROM "public"."medical_waste" "mw"
  ORDER BY "date" DESC;


ALTER VIEW "public"."vw_medical_waste" OWNER TO "postgres";

--
-- Name: vw_medical_waste_with_details; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."vw_medical_waste_with_details" AS
 SELECT "mw"."id",
    "mw"."waste_code",
    "mw"."name",
    "mw"."period",
    "mw"."date",
    "mw"."qty_generated",
    "mw"."qty_transferred",
    "mw"."carrier",
    "mw"."processor",
    "mw"."transfer_date",
    "mw"."doc_no",
    "mw"."responsible",
    "mw"."created_at",
    "mw"."auto_generated",
    "mw"."source_batch_id",
    "mw"."source_product_id",
    "mw"."package_count",
        CASE
            WHEN "mw"."auto_generated" THEN 'automatic'::"text"
            ELSE 'manual'::"text"
        END AS "source_type",
    "p"."name" AS "product_name",
    "p"."category" AS "product_category",
    "b"."lot" AS "batch_lot",
    "b"."expiry_date" AS "batch_expiry",
    "b"."mfg_date" AS "batch_mfg_date",
    "bwt"."waste_generated_at" AS "auto_generated_at"
   FROM ((("public"."medical_waste" "mw"
     LEFT JOIN "public"."products" "p" ON (("mw"."source_product_id" = "p"."id")))
     LEFT JOIN "public"."batches" "b" ON (("mw"."source_batch_id" = "b"."id")))
     LEFT JOIN "public"."batch_waste_tracking" "bwt" ON (("bwt"."medical_waste_id" = "mw"."id")))
  ORDER BY "mw"."created_at" DESC;


ALTER VIEW "public"."vw_medical_waste_with_details" OWNER TO "postgres";

--
-- Name: vw_milk_analytics; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."vw_milk_analytics" AS
 SELECT "id" AS "animal_id",
    "tag_no",
    "species",
    "holder_name",
    ( SELECT "mt"."test_date"
           FROM "public"."milk_tests" "mt"
          WHERE ("mt"."animal_id" = "a"."id")
          ORDER BY "mt"."test_date" DESC
         LIMIT 1) AS "latest_test_date",
    ( SELECT "mt"."fat_percentage"
           FROM "public"."milk_tests" "mt"
          WHERE ("mt"."animal_id" = "a"."id")
          ORDER BY "mt"."test_date" DESC
         LIMIT 1) AS "latest_fat_pct",
    ( SELECT "mt"."protein_percentage"
           FROM "public"."milk_tests" "mt"
          WHERE ("mt"."animal_id" = "a"."id")
          ORDER BY "mt"."test_date" DESC
         LIMIT 1) AS "latest_protein_pct",
    ( SELECT "mt"."somatic_cell_count"
           FROM "public"."milk_tests" "mt"
          WHERE ("mt"."animal_id" = "a"."id")
          ORDER BY "mt"."test_date" DESC
         LIMIT 1) AS "latest_scc",
    ( SELECT "mt"."test_status"
           FROM "public"."milk_tests" "mt"
          WHERE ("mt"."animal_id" = "a"."id")
          ORDER BY "mt"."test_date" DESC
         LIMIT 1) AS "latest_test_status",
    ( SELECT "count"(*) AS "count"
           FROM "public"."milk_production" "mp"
          WHERE (("mp"."animal_id" = "a"."id") AND ("mp"."measurement_date" >= (CURRENT_DATE - '7 days'::interval)))) AS "milkings_last_7_days",
    ( SELECT COALESCE("sum"("mp"."milk_quantity"), (0)::numeric) AS "coalesce"
           FROM "public"."milk_production" "mp"
          WHERE (("mp"."animal_id" = "a"."id") AND ("mp"."measurement_date" >= (CURRENT_DATE - '7 days'::interval)))) AS "total_milk_7_days",
    ( SELECT COALESCE("avg"("mp"."milk_quantity"), (0)::numeric) AS "coalesce"
           FROM "public"."milk_production" "mp"
          WHERE (("mp"."animal_id" = "a"."id") AND ("mp"."measurement_date" >= (CURRENT_DATE - '7 days'::interval)))) AS "avg_milk_per_session",
    ( SELECT COALESCE("sum"("mp"."milk_quantity"), (0)::numeric) AS "coalesce"
           FROM "public"."milk_production" "mp"
          WHERE (("mp"."animal_id" = "a"."id") AND ("mp"."measurement_date" = CURRENT_DATE))) AS "milk_today",
    ( SELECT "mp"."measurement_time"
           FROM "public"."milk_production" "mp"
          WHERE ("mp"."animal_id" = "a"."id")
          ORDER BY "mp"."measurement_date" DESC, "mp"."measurement_time" DESC
         LIMIT 1) AS "latest_milking_time"
   FROM "public"."animals" "a"
  WHERE (("species" ~~* '%karv%'::"text") OR ("species" ~~* '%cow%'::"text"))
  ORDER BY "tag_no";


ALTER VIEW "public"."vw_milk_analytics" OWNER TO "postgres";

--
-- Name: vw_owner_admin_meds; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."vw_owner_admin_meds" AS
 SELECT "tc"."id" AS "course_id",
    "t"."animal_id",
    "t"."disease_id",
    "tc"."product_id",
    "t"."reg_date" AS "prescription_date",
    "tc"."start_date" AS "first_admin_date",
    "a"."tag_no" AS "animal_tag",
    "a"."species",
    "a"."holder_name" AS "owner_name",
    "p"."name" AS "product_name",
    "p"."registration_code",
    "tc"."daily_dose",
    "tc"."unit",
    "tc"."days" AS "treatment_days",
    "tc"."total_dose",
    "tc"."doses_administered",
    "tc"."status" AS "course_status",
    "d"."name" AS "disease_name",
    "t"."vet_name" AS "prescribing_vet",
    "b"."lot" AS "batch_number",
    "b"."expiry_date" AS "batch_expiry"
   FROM ((((("public"."treatment_courses" "tc"
     JOIN "public"."treatments" "t" ON (("tc"."treatment_id" = "t"."id")))
     LEFT JOIN "public"."animals" "a" ON (("t"."animal_id" = "a"."id")))
     JOIN "public"."products" "p" ON (("tc"."product_id" = "p"."id")))
     LEFT JOIN "public"."diseases" "d" ON (("t"."disease_id" = "d"."id")))
     LEFT JOIN "public"."batches" "b" ON (("tc"."batch_id" = "b"."id")))
  ORDER BY "tc"."start_date" DESC;


ALTER VIEW "public"."vw_owner_admin_meds" OWNER TO "postgres";

--
-- Name: vw_spend_per_animal; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."vw_spend_per_animal" AS
 SELECT "a"."id" AS "animal_id",
    "a"."tag_no",
    "count"(DISTINCT "t"."id") AS "treatment_count",
    COALESCE("sum"(("ui"."qty" * COALESCE(("b"."purchase_price" / NULLIF("b"."received_qty", (0)::numeric)), (0)::numeric))), (0)::numeric) AS "total_spend"
   FROM ((("public"."animals" "a"
     LEFT JOIN "public"."treatments" "t" ON (("t"."animal_id" = "a"."id")))
     LEFT JOIN "public"."usage_items" "ui" ON (("ui"."treatment_id" = "t"."id")))
     LEFT JOIN "public"."batches" "b" ON (("b"."id" = "ui"."batch_id")))
  GROUP BY "a"."id", "a"."tag_no";


ALTER VIEW "public"."vw_spend_per_animal" OWNER TO "postgres";

--
-- Name: vw_teat_treatment_analytics; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."vw_teat_treatment_analytics" AS
 WITH "teat_treatments" AS (
         SELECT "t"."animal_id",
            "a"."tag_no",
            "jsonb_array_elements_text"(COALESCE("t"."sick_teats", '[]'::"jsonb")) AS "teat",
            "t"."mastitis_type",
            "t"."outcome",
            "t"."reg_date",
            "t"."id" AS "treatment_id"
           FROM ("public"."treatments" "t"
             JOIN "public"."animals" "a" ON (("a"."id" = "t"."animal_id")))
          WHERE (("t"."sick_teats" IS NOT NULL) AND ("jsonb_array_length"(COALESCE("t"."sick_teats", '[]'::"jsonb")) > 0))
        UNION ALL
         SELECT "t"."animal_id",
            "a"."tag_no",
            "t"."mastitis_teat" AS "teat",
            "t"."mastitis_type",
            "t"."outcome",
            "t"."reg_date",
            "t"."id" AS "treatment_id"
           FROM ("public"."treatments" "t"
             JOIN "public"."animals" "a" ON (("a"."id" = "t"."animal_id")))
          WHERE (("t"."mastitis_teat" IS NOT NULL) AND (("t"."sick_teats" IS NULL) OR ("jsonb_array_length"(COALESCE("t"."sick_teats", '[]'::"jsonb")) = 0)))
        )
 SELECT "animal_id",
    "tag_no",
    "teat",
    "count"(*) AS "treatment_count",
    "count"(
        CASE
            WHEN ("mastitis_type" = 'new'::"text") THEN 1
            ELSE NULL::integer
        END) AS "new_case_count",
    "count"(
        CASE
            WHEN ("mastitis_type" = 'recurring'::"text") THEN 1
            ELSE NULL::integer
        END) AS "recurring_case_count",
    "count"(
        CASE
            WHEN ("outcome" = 'recovered'::"text") THEN 1
            ELSE NULL::integer
        END) AS "recovered_count",
    "count"(
        CASE
            WHEN ("outcome" = 'ongoing'::"text") THEN 1
            ELSE NULL::integer
        END) AS "ongoing_count",
    "min"("reg_date") AS "first_treatment_date",
    "max"("reg_date") AS "last_treatment_date"
   FROM "teat_treatments"
  GROUP BY "animal_id", "tag_no", "teat";


ALTER VIEW "public"."vw_teat_treatment_analytics" OWNER TO "postgres";

--
-- Name: vw_treated_animals; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."vw_treated_animals" AS
 SELECT "t"."id" AS "treatment_id",
    "t"."animal_id",
    "t"."disease_id",
    "t"."reg_date" AS "registration_date",
    "a"."tag_no" AS "animal_tag",
    "a"."species",
    "a"."holder_name" AS "owner_name",
    "a"."holder_address" AS "owner_address",
    COALESCE("d"."name", NULLIF(TRIM(BOTH FROM "t"."clinical_diagnosis"), ''::"text"), NULLIF(TRIM(BOTH FROM "t"."animal_condition"), ''::"text")) AS "disease_name",
    "d"."code" AS "disease_code",
    "t"."clinical_diagnosis",
    "t"."animal_condition",
    "t"."first_symptoms_date",
    COALESCE(NULLIF(TRIM(BOTH FROM "concat"(COALESCE(( SELECT "string_agg"(DISTINCT "p"."name", ', '::"text") AS "string_agg"
           FROM ("public"."usage_items" "ui"
             JOIN "public"."products" "p" ON (("ui"."product_id" = "p"."id")))
          WHERE ("ui"."treatment_id" = "t"."id")), ''::"text"),
        CASE
            WHEN ((EXISTS ( SELECT 1
               FROM "public"."usage_items"
              WHERE ("usage_items"."treatment_id" = "t"."id"))) AND ((EXISTS ( SELECT 1
               FROM "public"."treatment_courses"
              WHERE ("treatment_courses"."treatment_id" = "t"."id"))) OR (("t"."visit_id" IS NOT NULL) AND (EXISTS ( SELECT 1
               FROM "public"."animal_visits" "av"
              WHERE (("av"."id" = "t"."visit_id") AND ("av"."planned_medications" IS NOT NULL) AND ("jsonb_array_length"("av"."planned_medications") > 0))))))) THEN ', '::"text"
            ELSE ''::"text"
        END, COALESCE(( SELECT "string_agg"(DISTINCT "p"."name", ', '::"text") AS "string_agg"
           FROM ("public"."treatment_courses" "tc"
             JOIN "public"."products" "p" ON (("tc"."product_id" = "p"."id")))
          WHERE ("tc"."treatment_id" = "t"."id")), ''::"text"),
        CASE
            WHEN (((EXISTS ( SELECT 1
               FROM "public"."usage_items"
              WHERE ("usage_items"."treatment_id" = "t"."id"))) OR (EXISTS ( SELECT 1
               FROM "public"."treatment_courses"
              WHERE ("treatment_courses"."treatment_id" = "t"."id")))) AND ("t"."visit_id" IS NOT NULL) AND (EXISTS ( SELECT 1
               FROM "public"."animal_visits" "av"
              WHERE (("av"."id" = "t"."visit_id") AND ("av"."planned_medications" IS NOT NULL) AND ("jsonb_array_length"("av"."planned_medications") > 0))))) THEN ', '::"text"
            ELSE ''::"text"
        END, COALESCE(( SELECT "string_agg"(DISTINCT "p"."name", ', '::"text") AS "string_agg"
           FROM "public"."animal_visits" "av",
            (LATERAL "jsonb_array_elements"("av"."planned_medications") "med"("value")
             JOIN "public"."products" "p" ON (("p"."id" = (("med"."value" ->> 'product_id'::"text"))::"uuid")))
          WHERE ("av"."id" = "t"."visit_id")), ''::"text"))), ''::"text"), NULL::"text") AS "products_used",
    COALESCE(NULLIF(TRIM(BOTH FROM "concat"(COALESCE(( SELECT "string_agg"("concat"("ui"."qty", ' ', "ui"."unit", ' (', "p"."name", ')'), '; '::"text" ORDER BY "p"."name") AS "string_agg"
           FROM ("public"."usage_items" "ui"
             JOIN "public"."products" "p" ON (("ui"."product_id" = "p"."id")))
          WHERE ("ui"."treatment_id" = "t"."id")), ''::"text"),
        CASE
            WHEN ((EXISTS ( SELECT 1
               FROM "public"."usage_items"
              WHERE ("usage_items"."treatment_id" = "t"."id"))) AND ((EXISTS ( SELECT 1
               FROM "public"."treatment_courses"
              WHERE ("treatment_courses"."treatment_id" = "t"."id"))) OR (("t"."visit_id" IS NOT NULL) AND (EXISTS ( SELECT 1
               FROM "public"."animal_visits" "av"
              WHERE (("av"."id" = "t"."visit_id") AND ("av"."planned_medications" IS NOT NULL) AND ("jsonb_array_length"("av"."planned_medications") > 0))))))) THEN '; '::"text"
            ELSE ''::"text"
        END, COALESCE(( SELECT "string_agg"("concat"("tc"."total_dose", ' ', "tc"."unit", ' (', "p"."name", ')'), '; '::"text" ORDER BY "p"."name") AS "string_agg"
           FROM ("public"."treatment_courses" "tc"
             JOIN "public"."products" "p" ON (("tc"."product_id" = "p"."id")))
          WHERE ("tc"."treatment_id" = "t"."id")), ''::"text"),
        CASE
            WHEN (((EXISTS ( SELECT 1
               FROM "public"."usage_items"
              WHERE ("usage_items"."treatment_id" = "t"."id"))) OR (EXISTS ( SELECT 1
               FROM "public"."treatment_courses"
              WHERE ("treatment_courses"."treatment_id" = "t"."id")))) AND ("t"."visit_id" IS NOT NULL) AND (EXISTS ( SELECT 1
               FROM "public"."animal_visits" "av"
              WHERE (("av"."id" = "t"."visit_id") AND ("av"."planned_medications" IS NOT NULL) AND ("jsonb_array_length"("av"."planned_medications") > 0))))) THEN '; '::"text"
            ELSE ''::"text"
        END, COALESCE(( SELECT "string_agg"("concat"(("med"."value" ->> 'qty'::"text"), ' ', ("med"."value" ->> 'unit'::"text"), ' (', "p"."name", ')'), '; '::"text" ORDER BY "p"."name") AS "string_agg"
           FROM "public"."animal_visits" "av",
            (LATERAL "jsonb_array_elements"("av"."planned_medications") "med"("value")
             JOIN "public"."products" "p" ON (("p"."id" = (("med"."value" ->> 'product_id'::"text"))::"uuid")))
          WHERE ("av"."id" = "t"."visit_id")), ''::"text"))), ''::"text"), NULL::"text") AS "dose_summary",
    COALESCE(( SELECT "max"("tc"."days") AS "max"
           FROM "public"."treatment_courses" "tc"
          WHERE ("tc"."treatment_id" = "t"."id")), 1) AS "treatment_days",
    "t"."withdrawal_until_meat",
    "t"."withdrawal_until_milk",
    "t"."outcome" AS "treatment_outcome",
    'ARTŪRAS ABROMAITIS'::"text" AS "veterinarian",
    "t"."notes"
   FROM (("public"."treatments" "t"
     LEFT JOIN "public"."animals" "a" ON (("t"."animal_id" = "a"."id")))
     LEFT JOIN "public"."diseases" "d" ON (("t"."disease_id" = "d"."id")))
  ORDER BY "t"."reg_date" DESC;


ALTER VIEW "public"."vw_treated_animals" OWNER TO "postgres";

--
-- Name: vw_treated_animals_detailed; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."vw_treated_animals_detailed" AS
 SELECT "t"."id" AS "treatment_id",
    "t"."animal_id",
    "t"."disease_id",
    "t"."reg_date" AS "registration_date",
    "a"."tag_no" AS "animal_tag",
    "a"."species",
    "a"."holder_name" AS "owner_name",
    "a"."holder_address" AS "owner_address",
    COALESCE("d"."name", NULLIF(TRIM(BOTH FROM "t"."clinical_diagnosis"), ''::"text"), NULLIF(TRIM(BOTH FROM "t"."animal_condition"), ''::"text"), 'Nespecifikuota liga'::"text") AS "disease_name",
    "d"."code" AS "disease_code",
    "t"."clinical_diagnosis",
    "t"."animal_condition",
    "t"."first_symptoms_date",
    "p"."name" AS "product_name",
    "concat"("ui"."qty", ' ', "ui"."unit") AS "dose",
    COALESCE(( SELECT "max"("tc"."days") AS "max"
           FROM "public"."treatment_courses" "tc"
          WHERE ("tc"."treatment_id" = "t"."id")), 1) AS "treatment_days",
    "t"."withdrawal_until_meat",
    "t"."withdrawal_until_milk",
    "t"."outcome" AS "treatment_outcome",
    'ARTŪRAS ABROMAITIS'::"text" AS "veterinarian",
    "t"."notes",
    'usage_item'::"text" AS "medication_source"
   FROM (((("public"."treatments" "t"
     LEFT JOIN "public"."animals" "a" ON (("t"."animal_id" = "a"."id")))
     LEFT JOIN "public"."diseases" "d" ON (("t"."disease_id" = "d"."id")))
     JOIN "public"."usage_items" "ui" ON (("ui"."treatment_id" = "t"."id")))
     JOIN "public"."products" "p" ON (("ui"."product_id" = "p"."id")))
UNION ALL
 SELECT "t"."id" AS "treatment_id",
    "t"."animal_id",
    "t"."disease_id",
    "t"."reg_date" AS "registration_date",
    "a"."tag_no" AS "animal_tag",
    "a"."species",
    "a"."holder_name" AS "owner_name",
    "a"."holder_address" AS "owner_address",
    COALESCE("d"."name", NULLIF(TRIM(BOTH FROM "t"."clinical_diagnosis"), ''::"text"), NULLIF(TRIM(BOTH FROM "t"."animal_condition"), ''::"text"), 'Nespecifikuota liga'::"text") AS "disease_name",
    "d"."code" AS "disease_code",
    "t"."clinical_diagnosis",
    "t"."animal_condition",
    "t"."first_symptoms_date",
    "p"."name" AS "product_name",
    "concat"("tc"."total_dose", ' ', "tc"."unit") AS "dose",
    "tc"."days" AS "treatment_days",
    "t"."withdrawal_until_meat",
    "t"."withdrawal_until_milk",
    "t"."outcome" AS "treatment_outcome",
    'ARTŪRAS ABROMAITIS'::"text" AS "veterinarian",
    "t"."notes",
    'treatment_course'::"text" AS "medication_source"
   FROM (((("public"."treatments" "t"
     LEFT JOIN "public"."animals" "a" ON (("t"."animal_id" = "a"."id")))
     LEFT JOIN "public"."diseases" "d" ON (("t"."disease_id" = "d"."id")))
     JOIN "public"."treatment_courses" "tc" ON (("tc"."treatment_id" = "t"."id")))
     JOIN "public"."products" "p" ON (("tc"."product_id" = "p"."id")))
UNION ALL
 SELECT "t"."id" AS "treatment_id",
    "t"."animal_id",
    "t"."disease_id",
    "t"."reg_date" AS "registration_date",
    "a"."tag_no" AS "animal_tag",
    "a"."species",
    "a"."holder_name" AS "owner_name",
    "a"."holder_address" AS "owner_address",
    COALESCE("d"."name", NULLIF(TRIM(BOTH FROM "t"."clinical_diagnosis"), ''::"text"), NULLIF(TRIM(BOTH FROM "t"."animal_condition"), ''::"text"), 'Nespecifikuota liga'::"text") AS "disease_name",
    "d"."code" AS "disease_code",
    "t"."clinical_diagnosis",
    "t"."animal_condition",
    "t"."first_symptoms_date",
    "p"."name" AS "product_name",
    "concat"(("med"."value" ->> 'qty'::"text"), ' ', ("med"."value" ->> 'unit'::"text")) AS "dose",
    COALESCE(( SELECT "max"("tc"."days") AS "max"
           FROM "public"."treatment_courses" "tc"
          WHERE ("tc"."treatment_id" = "t"."id")), 1) AS "treatment_days",
    "t"."withdrawal_until_meat",
    "t"."withdrawal_until_milk",
    "t"."outcome" AS "treatment_outcome",
    'ARTŪRAS ABROMAITIS'::"text" AS "veterinarian",
    "t"."notes",
    'planned_medication'::"text" AS "medication_source"
   FROM ((((("public"."treatments" "t"
     LEFT JOIN "public"."animals" "a" ON (("t"."animal_id" = "a"."id")))
     LEFT JOIN "public"."diseases" "d" ON (("t"."disease_id" = "d"."id")))
     JOIN "public"."animal_visits" "av" ON (("av"."id" = "t"."visit_id")))
     CROSS JOIN LATERAL "jsonb_array_elements"("av"."planned_medications") "med"("value"))
     JOIN "public"."products" "p" ON (("p"."id" = (("med"."value" ->> 'product_id'::"text"))::"uuid")))
  WHERE (("av"."planned_medications" IS NOT NULL) AND ("jsonb_array_length"("av"."planned_medications") > 0))
  ORDER BY 4 DESC;


ALTER VIEW "public"."vw_treated_animals_detailed" OWNER TO "postgres";

--
-- Name: VIEW "vw_treated_animals_detailed"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON VIEW "public"."vw_treated_animals_detailed" IS 'Detailed view of treated animals with one row per medication. Disease is NEVER NULL. Treatment duration calculated from treatment courses.';


--
-- Name: vw_vet_drug_journal; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."vw_vet_drug_journal" AS
 SELECT "b"."id" AS "batch_id",
    "b"."product_id",
    "b"."created_at" AS "receipt_date",
    "p"."name" AS "product_name",
    "p"."registration_code",
    "p"."active_substance",
    "s"."name" AS "supplier_name",
    "b"."lot" AS "batch_number",
    "b"."mfg_date" AS "manufacture_date",
    "b"."expiry_date",
    "b"."received_qty" AS "quantity_received",
    "p"."primary_pack_unit" AS "unit",
    COALESCE(( SELECT "sum"("ui"."qty") AS "sum"
           FROM "public"."usage_items" "ui"
          WHERE ("ui"."batch_id" = "b"."id")), (0)::numeric) AS "quantity_used",
    ("b"."received_qty" - COALESCE(( SELECT "sum"("ui"."qty") AS "sum"
           FROM "public"."usage_items" "ui"
          WHERE ("ui"."batch_id" = "b"."id")), (0)::numeric)) AS "quantity_remaining",
    "b"."doc_number" AS "invoice_number",
    "b"."doc_date" AS "invoice_date"
   FROM (("public"."batches" "b"
     JOIN "public"."products" "p" ON (("b"."product_id" = "p"."id")))
     LEFT JOIN "public"."suppliers" "s" ON (("b"."supplier_id" = "s"."id")))
  WHERE ("p"."category" = ANY (ARRAY['medicines'::"public"."product_category", 'prevention'::"public"."product_category"]))
  ORDER BY "b"."created_at" DESC;


ALTER VIEW "public"."vw_vet_drug_journal" OWNER TO "postgres";

--
-- Name: vw_withdrawal_status; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."vw_withdrawal_status" AS
 SELECT "t"."animal_id",
    "a"."tag_no",
    "max"("t"."withdrawal_until_milk") AS "milk_until",
    "max"("t"."withdrawal_until_meat") AS "meat_until",
        CASE
            WHEN ("max"("t"."withdrawal_until_milk") >= CURRENT_DATE) THEN true
            ELSE false
        END AS "milk_active",
        CASE
            WHEN ("max"("t"."withdrawal_until_meat") >= CURRENT_DATE) THEN true
            ELSE false
        END AS "meat_active"
   FROM ("public"."treatments" "t"
     LEFT JOIN "public"."animals" "a" ON (("a"."id" = "t"."animal_id")))
  WHERE ("t"."animal_id" IS NOT NULL)
  GROUP BY "t"."animal_id", "a"."tag_no";


ALTER VIEW "public"."vw_withdrawal_status" OWNER TO "postgres";

--
-- Name: work_order_labor; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."work_order_labor" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "work_order_id" "uuid",
    "technician_id" "uuid",
    "labor_type" "text",
    "hours_worked" numeric NOT NULL,
    "hourly_rate" numeric,
    "total_cost" numeric NOT NULL,
    "work_date" "date" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."work_order_labor" OWNER TO "postgres";

--
-- Name: worker_schedules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."worker_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "worker_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "shift_start" time without time zone,
    "shift_end" time without time zone,
    "schedule_type" "text" DEFAULT 'work'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid"
);


ALTER TABLE "public"."worker_schedules" OWNER TO "postgres";

--
-- Name: animal_synchronizations animal_synchronizations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."animal_synchronizations"
    ADD CONSTRAINT "animal_synchronizations_pkey" PRIMARY KEY ("id");


--
-- Name: animal_visits animal_visits_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."animal_visits"
    ADD CONSTRAINT "animal_visits_pkey" PRIMARY KEY ("id");


--
-- Name: animals animals_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."animals"
    ADD CONSTRAINT "animals_pkey" PRIMARY KEY ("id");


--
-- Name: batch_waste_tracking batch_waste_tracking_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."batch_waste_tracking"
    ADD CONSTRAINT "batch_waste_tracking_pkey" PRIMARY KEY ("batch_id");


--
-- Name: batches batches_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."batches"
    ADD CONSTRAINT "batches_pkey" PRIMARY KEY ("id");


--
-- Name: biocide_usage biocide_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."biocide_usage"
    ADD CONSTRAINT "biocide_usage_pkey" PRIMARY KEY ("id");


--
-- Name: cost_accumulation_documents cost_accumulation_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."cost_accumulation_documents"
    ADD CONSTRAINT "cost_accumulation_documents_pkey" PRIMARY KEY ("id");


--
-- Name: cost_accumulation_items cost_accumulation_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."cost_accumulation_items"
    ADD CONSTRAINT "cost_accumulation_items_pkey" PRIMARY KEY ("id");


--
-- Name: cost_accumulation_projects cost_accumulation_projects_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."cost_accumulation_projects"
    ADD CONSTRAINT "cost_accumulation_projects_pkey" PRIMARY KEY ("id");


--
-- Name: cost_centers cost_centers_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."cost_centers"
    ADD CONSTRAINT "cost_centers_name_key" UNIQUE ("name");


--
-- Name: cost_centers cost_centers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."cost_centers"
    ADD CONSTRAINT "cost_centers_pkey" PRIMARY KEY ("id");


--
-- Name: course_doses course_doses_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_doses"
    ADD CONSTRAINT "course_doses_pkey" PRIMARY KEY ("id");


--
-- Name: course_medication_schedules course_medication_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_medication_schedules"
    ADD CONSTRAINT "course_medication_schedules_pkey" PRIMARY KEY ("id");


--
-- Name: diseases diseases_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."diseases"
    ADD CONSTRAINT "diseases_pkey" PRIMARY KEY ("id");


--
-- Name: equipment_batches equipment_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."equipment_batches"
    ADD CONSTRAINT "equipment_batches_pkey" PRIMARY KEY ("id");


--
-- Name: equipment_categories equipment_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."equipment_categories"
    ADD CONSTRAINT "equipment_categories_pkey" PRIMARY KEY ("id");


--
-- Name: equipment_invoice_item_assignments equipment_invoice_item_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."equipment_invoice_item_assignments"
    ADD CONSTRAINT "equipment_invoice_item_assignments_pkey" PRIMARY KEY ("id");


--
-- Name: equipment_invoice_items equipment_invoice_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."equipment_invoice_items"
    ADD CONSTRAINT "equipment_invoice_items_pkey" PRIMARY KEY ("id");


--
-- Name: equipment_invoices equipment_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."equipment_invoices"
    ADD CONSTRAINT "equipment_invoices_pkey" PRIMARY KEY ("id");


--
-- Name: equipment_issuance_items equipment_issuance_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."equipment_issuance_items"
    ADD CONSTRAINT "equipment_issuance_items_pkey" PRIMARY KEY ("id");


--
-- Name: equipment_issuances equipment_issuances_issuance_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."equipment_issuances"
    ADD CONSTRAINT "equipment_issuances_issuance_number_key" UNIQUE ("issuance_number");


--
-- Name: equipment_issuances equipment_issuances_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."equipment_issuances"
    ADD CONSTRAINT "equipment_issuances_pkey" PRIMARY KEY ("id");


--
-- Name: equipment_locations equipment_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."equipment_locations"
    ADD CONSTRAINT "equipment_locations_pkey" PRIMARY KEY ("id");


--
-- Name: equipment_products equipment_products_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."equipment_products"
    ADD CONSTRAINT "equipment_products_pkey" PRIMARY KEY ("id");


--
-- Name: equipment_products equipment_products_product_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."equipment_products"
    ADD CONSTRAINT "equipment_products_product_code_key" UNIQUE ("product_code");


--
-- Name: equipment_stock_movements equipment_stock_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."equipment_stock_movements"
    ADD CONSTRAINT "equipment_stock_movements_pkey" PRIMARY KEY ("id");


--
-- Name: equipment_suppliers equipment_suppliers_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."equipment_suppliers"
    ADD CONSTRAINT "equipment_suppliers_code_key" UNIQUE ("code");


--
-- Name: equipment_suppliers equipment_suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."equipment_suppliers"
    ADD CONSTRAINT "equipment_suppliers_pkey" PRIMARY KEY ("id");


--
-- Name: farm_equipment_items farm_equipment_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."farm_equipment_items"
    ADD CONSTRAINT "farm_equipment_items_pkey" PRIMARY KEY ("id");


--
-- Name: farm_equipment farm_equipment_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."farm_equipment"
    ADD CONSTRAINT "farm_equipment_pkey" PRIMARY KEY ("id");


--
-- Name: farm_equipment_service_parts farm_equipment_service_parts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."farm_equipment_service_parts"
    ADD CONSTRAINT "farm_equipment_service_parts_pkey" PRIMARY KEY ("id");


--
-- Name: farm_equipment_service_records farm_equipment_service_records_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."farm_equipment_service_records"
    ADD CONSTRAINT "farm_equipment_service_records_pkey" PRIMARY KEY ("id");


--
-- Name: fire_extinguishers fire_extinguishers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."fire_extinguishers"
    ADD CONSTRAINT "fire_extinguishers_pkey" PRIMARY KEY ("id");


--
-- Name: fire_extinguishers fire_extinguishers_serial_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."fire_extinguishers"
    ADD CONSTRAINT "fire_extinguishers_serial_number_key" UNIQUE ("serial_number");


--
-- Name: gea_daily_ataskaita1 gea_daily_ataskaita1_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."gea_daily_ataskaita1"
    ADD CONSTRAINT "gea_daily_ataskaita1_pkey" PRIMARY KEY ("id");


--
-- Name: gea_daily_ataskaita2 gea_daily_ataskaita2_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."gea_daily_ataskaita2"
    ADD CONSTRAINT "gea_daily_ataskaita2_pkey" PRIMARY KEY ("id");


--
-- Name: gea_daily_ataskaita3 gea_daily_ataskaita3_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."gea_daily_ataskaita3"
    ADD CONSTRAINT "gea_daily_ataskaita3_pkey" PRIMARY KEY ("id");


--
-- Name: gea_daily_imports gea_daily_imports_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."gea_daily_imports"
    ADD CONSTRAINT "gea_daily_imports_pkey" PRIMARY KEY ("id");


--
-- Name: hoof_condition_codes hoof_condition_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."hoof_condition_codes"
    ADD CONSTRAINT "hoof_condition_codes_pkey" PRIMARY KEY ("code");


--
-- Name: hoof_records hoof_records_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."hoof_records"
    ADD CONSTRAINT "hoof_records_pkey" PRIMARY KEY ("id");


--
-- Name: insemination_inventory insemination_inventory_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."insemination_inventory"
    ADD CONSTRAINT "insemination_inventory_pkey" PRIMARY KEY ("id");


--
-- Name: insemination_products insemination_products_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."insemination_products"
    ADD CONSTRAINT "insemination_products_pkey" PRIMARY KEY ("id");


--
-- Name: insemination_records insemination_records_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."insemination_records"
    ADD CONSTRAINT "insemination_records_pkey" PRIMARY KEY ("id");


--
-- Name: invoice_items invoice_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."invoice_items"
    ADD CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id");


--
-- Name: invoices invoices_invoice_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_invoice_number_key" UNIQUE ("invoice_number");


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");


--
-- Name: maintenance_schedules maintenance_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."maintenance_schedules"
    ADD CONSTRAINT "maintenance_schedules_pkey" PRIMARY KEY ("id");


--
-- Name: maintenance_work_orders maintenance_work_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."maintenance_work_orders"
    ADD CONSTRAINT "maintenance_work_orders_pkey" PRIMARY KEY ("id");


--
-- Name: maintenance_work_orders maintenance_work_orders_work_order_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."maintenance_work_orders"
    ADD CONSTRAINT "maintenance_work_orders_work_order_number_key" UNIQUE ("work_order_number");


--
-- Name: medical_waste medical_waste_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."medical_waste"
    ADD CONSTRAINT "medical_waste_pkey" PRIMARY KEY ("id");


--
-- Name: milk_composition_tests milk_composition_tests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."milk_composition_tests"
    ADD CONSTRAINT "milk_composition_tests_pkey" PRIMARY KEY ("id");


--
-- Name: milk_composition_tests milk_composition_tests_producer_id_paemimo_data_konteineris_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."milk_composition_tests"
    ADD CONSTRAINT "milk_composition_tests_producer_id_paemimo_data_konteineris_key" UNIQUE ("producer_id", "paemimo_data", "konteineris");


--
-- Name: milk_producers milk_producers_gamintojo_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."milk_producers"
    ADD CONSTRAINT "milk_producers_gamintojo_id_key" UNIQUE ("gamintojo_id");


--
-- Name: milk_producers milk_producers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."milk_producers"
    ADD CONSTRAINT "milk_producers_pkey" PRIMARY KEY ("id");


--
-- Name: milk_production milk_production_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."milk_production"
    ADD CONSTRAINT "milk_production_pkey" PRIMARY KEY ("id");


--
-- Name: milk_quality_tests milk_quality_tests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."milk_quality_tests"
    ADD CONSTRAINT "milk_quality_tests_pkey" PRIMARY KEY ("id");


--
-- Name: milk_quality_tests milk_quality_tests_producer_id_paemimo_data_konteineris_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."milk_quality_tests"
    ADD CONSTRAINT "milk_quality_tests_producer_id_paemimo_data_konteineris_key" UNIQUE ("producer_id", "paemimo_data", "konteineris");


--
-- Name: milk_scrape_sessions milk_scrape_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."milk_scrape_sessions"
    ADD CONSTRAINT "milk_scrape_sessions_pkey" PRIMARY KEY ("id");


--
-- Name: milk_test_summaries milk_test_summaries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."milk_test_summaries"
    ADD CONSTRAINT "milk_test_summaries_pkey" PRIMARY KEY ("id");


--
-- Name: milk_tests milk_tests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."milk_tests"
    ADD CONSTRAINT "milk_tests_pkey" PRIMARY KEY ("id");


--
-- Name: milk_weights milk_weights_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."milk_weights"
    ADD CONSTRAINT "milk_weights_pkey" PRIMARY KEY ("id");


--
-- Name: ppe_issuance_records ppe_issuance_records_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ppe_issuance_records"
    ADD CONSTRAINT "ppe_issuance_records_pkey" PRIMARY KEY ("id");


--
-- Name: ppe_items ppe_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ppe_items"
    ADD CONSTRAINT "ppe_items_pkey" PRIMARY KEY ("id");


--
-- Name: product_quality_reviews product_quality_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_quality_reviews"
    ADD CONSTRAINT "product_quality_reviews_pkey" PRIMARY KEY ("id");


--
-- Name: product_quality_schedules product_quality_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_quality_schedules"
    ADD CONSTRAINT "product_quality_schedules_pkey" PRIMARY KEY ("id");


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");


--
-- Name: shared_notepad shared_notepad_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."shared_notepad"
    ADD CONSTRAINT "shared_notepad_pkey" PRIMARY KEY ("id");


--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id");


--
-- Name: synchronization_protocols synchronization_protocols_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."synchronization_protocols"
    ADD CONSTRAINT "synchronization_protocols_name_key" UNIQUE ("name");


--
-- Name: synchronization_protocols synchronization_protocols_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."synchronization_protocols"
    ADD CONSTRAINT "synchronization_protocols_pkey" PRIMARY KEY ("id");


--
-- Name: synchronization_steps synchronization_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."synchronization_steps"
    ADD CONSTRAINT "synchronization_steps_pkey" PRIMARY KEY ("id");


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."system_settings"
    ADD CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id");


--
-- Name: system_settings system_settings_setting_key_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."system_settings"
    ADD CONSTRAINT "system_settings_setting_key_key" UNIQUE ("setting_key");


--
-- Name: teat_status teat_status_animal_id_teat_position_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."teat_status"
    ADD CONSTRAINT "teat_status_animal_id_teat_position_key" UNIQUE ("animal_id", "teat_position");


--
-- Name: teat_status teat_status_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."teat_status"
    ADD CONSTRAINT "teat_status_pkey" PRIMARY KEY ("id");


--
-- Name: tool_movements tool_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tool_movements"
    ADD CONSTRAINT "tool_movements_pkey" PRIMARY KEY ("id");


--
-- Name: tools tools_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tools"
    ADD CONSTRAINT "tools_pkey" PRIMARY KEY ("id");


--
-- Name: tools tools_tool_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tools"
    ADD CONSTRAINT "tools_tool_number_key" UNIQUE ("tool_number");


--
-- Name: treatment_courses treatment_courses_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."treatment_courses"
    ADD CONSTRAINT "treatment_courses_pkey" PRIMARY KEY ("id");


--
-- Name: treatments treatments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."treatments"
    ADD CONSTRAINT "treatments_pkey" PRIMARY KEY ("id");


--
-- Name: course_medication_schedules unique_course_med_date; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_medication_schedules"
    ADD CONSTRAINT "unique_course_med_date" UNIQUE ("course_id", "product_id", "scheduled_date", "teat");


--
-- Name: usage_items usage_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."usage_items"
    ADD CONSTRAINT "usage_items_pkey" PRIMARY KEY ("id");


--
-- Name: user_audit_logs user_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_audit_logs"
    ADD CONSTRAINT "user_audit_logs_pkey" PRIMARY KEY ("id");


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");


--
-- Name: vaccinations vaccinations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."vaccinations"
    ADD CONSTRAINT "vaccinations_pkey" PRIMARY KEY ("id");


--
-- Name: vehicle_assignments vehicle_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."vehicle_assignments"
    ADD CONSTRAINT "vehicle_assignments_pkey" PRIMARY KEY ("id");


--
-- Name: vehicle_documents vehicle_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."vehicle_documents"
    ADD CONSTRAINT "vehicle_documents_pkey" PRIMARY KEY ("id");


--
-- Name: vehicle_fuel_records vehicle_fuel_records_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."vehicle_fuel_records"
    ADD CONSTRAINT "vehicle_fuel_records_pkey" PRIMARY KEY ("id");


--
-- Name: vehicle_service_visits vehicle_service_visits_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."vehicle_service_visits"
    ADD CONSTRAINT "vehicle_service_visits_pkey" PRIMARY KEY ("id");


--
-- Name: vehicle_visit_parts vehicle_visit_parts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."vehicle_visit_parts"
    ADD CONSTRAINT "vehicle_visit_parts_pkey" PRIMARY KEY ("id");


--
-- Name: vehicles vehicles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id");


--
-- Name: vehicles vehicles_registration_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_registration_number_key" UNIQUE ("registration_number");


--
-- Name: vehicles vehicles_vin_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_vin_key" UNIQUE ("vin");


--
-- Name: work_order_labor work_order_labor_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."work_order_labor"
    ADD CONSTRAINT "work_order_labor_pkey" PRIMARY KEY ("id");


--
-- Name: work_order_parts work_order_parts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."work_order_parts"
    ADD CONSTRAINT "work_order_parts_pkey" PRIMARY KEY ("id");


--
-- Name: worker_schedules worker_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."worker_schedules"
    ADD CONSTRAINT "worker_schedules_pkey" PRIMARY KEY ("id");


--
-- Name: animals_tag_no_uk; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "animals_tag_no_uk" ON "public"."animals" USING "btree" ("tag_no");


--
-- Name: batches_expiry_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "batches_expiry_idx" ON "public"."batches" USING "btree" ("expiry_date");


--
-- Name: batches_product_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "batches_product_idx" ON "public"."batches" USING "btree" ("product_id");


--
-- Name: diseases_name_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "diseases_name_idx" ON "public"."diseases" USING "btree" ("lower"("name"));


--
-- Name: idx_animal_synchronizations_animal_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_animal_synchronizations_animal_id" ON "public"."animal_synchronizations" USING "btree" ("animal_id");


--
-- Name: idx_animal_synchronizations_start_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_animal_synchronizations_start_date" ON "public"."animal_synchronizations" USING "btree" ("start_date");


--
-- Name: idx_animal_synchronizations_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_animal_synchronizations_status" ON "public"."animal_synchronizations" USING "btree" ("status");


--
-- Name: idx_animal_visits_animal_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_animal_visits_animal_id" ON "public"."animal_visits" USING "btree" ("animal_id");


--
-- Name: idx_animal_visits_animal_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_animal_visits_animal_status" ON "public"."animal_visits" USING "btree" ("animal_id", "status");


--
-- Name: idx_animal_visits_course; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_animal_visits_course" ON "public"."animal_visits" USING "btree" ("course_id") WHERE ("course_id" IS NOT NULL);


--
-- Name: idx_animal_visits_datetime; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_animal_visits_datetime" ON "public"."animal_visits" USING "btree" ("visit_datetime");


--
-- Name: idx_animal_visits_related_treatment; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_animal_visits_related_treatment" ON "public"."animal_visits" USING "btree" ("related_treatment_id") WHERE ("related_treatment_id" IS NOT NULL);


--
-- Name: idx_animal_visits_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_animal_visits_status" ON "public"."animal_visits" USING "btree" ("status");


--
-- Name: idx_animal_visits_sync_step; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_animal_visits_sync_step" ON "public"."animal_visits" USING "btree" ("sync_step_id");


--
-- Name: idx_audit_logs_action; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_audit_logs_action" ON "public"."user_audit_logs" USING "btree" ("action");


--
-- Name: idx_audit_logs_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_audit_logs_created_at" ON "public"."user_audit_logs" USING "btree" ("created_at" DESC);


--
-- Name: idx_audit_logs_table_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_audit_logs_table_name" ON "public"."user_audit_logs" USING "btree" ("table_name");


--
-- Name: idx_audit_logs_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_audit_logs_user_id" ON "public"."user_audit_logs" USING "btree" ("user_id");


--
-- Name: idx_batch_waste_tracking_batch; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_batch_waste_tracking_batch" ON "public"."batch_waste_tracking" USING "btree" ("batch_id");


--
-- Name: idx_batches_invoice; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_batches_invoice" ON "public"."batches" USING "btree" ("invoice_id");


--
-- Name: idx_batches_package_count; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_batches_package_count" ON "public"."batches" USING "btree" ("package_count");


--
-- Name: idx_batches_package_size; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_batches_package_size" ON "public"."batches" USING "btree" ("package_size");


--
-- Name: idx_cost_accumulation_documents_project_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_cost_accumulation_documents_project_id" ON "public"."cost_accumulation_documents" USING "btree" ("project_id");


--
-- Name: idx_cost_accumulation_documents_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_cost_accumulation_documents_status" ON "public"."cost_accumulation_documents" USING "btree" ("processing_status");


--
-- Name: idx_cost_accumulation_items_document_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_cost_accumulation_items_document_id" ON "public"."cost_accumulation_items" USING "btree" ("document_id");


--
-- Name: idx_cost_accumulation_items_project_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_cost_accumulation_items_project_id" ON "public"."cost_accumulation_items" USING "btree" ("project_id");


--
-- Name: idx_cost_centers_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_cost_centers_active" ON "public"."cost_centers" USING "btree" ("is_active") WHERE ("is_active" = true);


--
-- Name: idx_cost_centers_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_cost_centers_name" ON "public"."cost_centers" USING "btree" ("name");


--
-- Name: idx_cost_centers_parent_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_cost_centers_parent_id" ON "public"."cost_centers" USING "btree" ("parent_id");


--
-- Name: idx_course_doses_course; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_course_doses_course" ON "public"."course_doses" USING "btree" ("course_id");


--
-- Name: idx_course_doses_scheduled; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_course_doses_scheduled" ON "public"."course_doses" USING "btree" ("scheduled_date");


--
-- Name: idx_course_medication_schedules_course; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_course_medication_schedules_course" ON "public"."course_medication_schedules" USING "btree" ("course_id");


--
-- Name: idx_course_medication_schedules_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_course_medication_schedules_date" ON "public"."course_medication_schedules" USING "btree" ("scheduled_date");


--
-- Name: idx_course_medication_schedules_visit; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_course_medication_schedules_visit" ON "public"."course_medication_schedules" USING "btree" ("visit_id") WHERE ("visit_id" IS NOT NULL);


--
-- Name: idx_courses_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_courses_status" ON "public"."treatment_courses" USING "btree" ("status");


--
-- Name: idx_courses_treatment; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_courses_treatment" ON "public"."treatment_courses" USING "btree" ("treatment_id");


--
-- Name: idx_equipment_issuance_items_batch; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_equipment_issuance_items_batch" ON "public"."equipment_issuance_items" USING "btree" ("batch_id");


--
-- Name: idx_equipment_issuance_items_product; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_equipment_issuance_items_product" ON "public"."equipment_issuance_items" USING "btree" ("product_id");


--
-- Name: idx_equipment_issuances_issued_to; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_equipment_issuances_issued_to" ON "public"."equipment_issuances" USING "btree" ("issued_to");


--
-- Name: idx_equipment_issuances_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_equipment_issuances_status" ON "public"."equipment_issuances" USING "btree" ("status");


--
-- Name: idx_equipment_item_assignments_cost_center; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_equipment_item_assignments_cost_center" ON "public"."equipment_invoice_item_assignments" USING "btree" ("cost_center_id") WHERE ("cost_center_id" IS NOT NULL);


--
-- Name: idx_equipment_item_assignments_invoice_item; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_equipment_item_assignments_invoice_item" ON "public"."equipment_invoice_item_assignments" USING "btree" ("invoice_item_id");


--
-- Name: idx_equipment_item_assignments_tool; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_equipment_item_assignments_tool" ON "public"."equipment_invoice_item_assignments" USING "btree" ("tool_id") WHERE ("tool_id" IS NOT NULL);


--
-- Name: idx_equipment_item_assignments_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_equipment_item_assignments_type" ON "public"."equipment_invoice_item_assignments" USING "btree" ("assignment_type");


--
-- Name: idx_equipment_item_assignments_vehicle; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_equipment_item_assignments_vehicle" ON "public"."equipment_invoice_item_assignments" USING "btree" ("vehicle_id") WHERE ("vehicle_id" IS NOT NULL);


--
-- Name: idx_equipment_stock_movements_batch_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_equipment_stock_movements_batch_id" ON "public"."equipment_stock_movements" USING "btree" ("batch_id");


--
-- Name: idx_equipment_stock_movements_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_equipment_stock_movements_created_at" ON "public"."equipment_stock_movements" USING "btree" ("created_at" DESC);


--
-- Name: idx_fire_extinguishers_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_fire_extinguishers_active" ON "public"."fire_extinguishers" USING "btree" ("is_active");


--
-- Name: idx_fire_extinguishers_expiry_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_fire_extinguishers_expiry_date" ON "public"."fire_extinguishers" USING "btree" ("expiry_date");


--
-- Name: idx_fire_extinguishers_location; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_fire_extinguishers_location" ON "public"."fire_extinguishers" USING "btree" ("location_id");


--
-- Name: idx_fire_extinguishers_placement_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_fire_extinguishers_placement_type" ON "public"."fire_extinguishers" USING "btree" ("placement_type");


--
-- Name: idx_fire_extinguishers_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_fire_extinguishers_status" ON "public"."fire_extinguishers" USING "btree" ("status");


--
-- Name: idx_fire_extinguishers_vehicle; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_fire_extinguishers_vehicle" ON "public"."fire_extinguishers" USING "btree" ("vehicle_id");


--
-- Name: idx_gea_a1_cow_number; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_gea_a1_cow_number" ON "public"."gea_daily_ataskaita1" USING "btree" ("cow_number");


--
-- Name: idx_gea_a1_import_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_gea_a1_import_id" ON "public"."gea_daily_ataskaita1" USING "btree" ("import_id");


--
-- Name: idx_gea_a2_cow_number; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_gea_a2_cow_number" ON "public"."gea_daily_ataskaita2" USING "btree" ("cow_number");


--
-- Name: idx_gea_a2_import_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_gea_a2_import_id" ON "public"."gea_daily_ataskaita2" USING "btree" ("import_id");


--
-- Name: idx_gea_a2_milkings_gin; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_gea_a2_milkings_gin" ON "public"."gea_daily_ataskaita2" USING "gin" ("milkings");


--
-- Name: idx_gea_a3_cow_number; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_gea_a3_cow_number" ON "public"."gea_daily_ataskaita3" USING "btree" ("cow_number");


--
-- Name: idx_gea_a3_import_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_gea_a3_import_id" ON "public"."gea_daily_ataskaita3" USING "btree" ("import_id");


--
-- Name: idx_gea_daily_imports_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_gea_daily_imports_created_at" ON "public"."gea_daily_imports" USING "btree" ("created_at" DESC);


--
-- Name: idx_hoof_records_animal_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_hoof_records_animal_id" ON "public"."hoof_records" USING "btree" ("animal_id");


--
-- Name: idx_hoof_records_condition_code; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_hoof_records_condition_code" ON "public"."hoof_records" USING "btree" ("condition_code");


--
-- Name: idx_hoof_records_examination_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_hoof_records_examination_date" ON "public"."hoof_records" USING "btree" ("examination_date" DESC);


--
-- Name: idx_hoof_records_followup; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_hoof_records_followup" ON "public"."hoof_records" USING "btree" ("followup_date") WHERE (("requires_followup" = true) AND ("followup_completed" = false));


--
-- Name: idx_hoof_records_leg_claw; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_hoof_records_leg_claw" ON "public"."hoof_records" USING "btree" ("animal_id", "leg", "claw", "examination_date" DESC);


--
-- Name: idx_hoof_records_visit_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_hoof_records_visit_id" ON "public"."hoof_records" USING "btree" ("visit_id");


--
-- Name: idx_insemination_inventory_expiry; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_insemination_inventory_expiry" ON "public"."insemination_inventory" USING "btree" ("expiry_date");


--
-- Name: idx_insemination_inventory_product_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_insemination_inventory_product_id" ON "public"."insemination_inventory" USING "btree" ("product_id");


--
-- Name: idx_insemination_records_animal_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_insemination_records_animal_id" ON "public"."insemination_records" USING "btree" ("animal_id");


--
-- Name: idx_insemination_records_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_insemination_records_date" ON "public"."insemination_records" USING "btree" ("insemination_date");


--
-- Name: idx_insemination_records_pregnancy; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_insemination_records_pregnancy" ON "public"."insemination_records" USING "btree" ("pregnancy_confirmed");


--
-- Name: idx_insemination_records_sync_step; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_insemination_records_sync_step" ON "public"."insemination_records" USING "btree" ("sync_step_id");


--
-- Name: idx_invoice_items_batch; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_invoice_items_batch" ON "public"."invoice_items" USING "btree" ("batch_id");


--
-- Name: idx_invoice_items_invoice; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_invoice_items_invoice" ON "public"."invoice_items" USING "btree" ("invoice_id");


--
-- Name: idx_invoice_items_product; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_invoice_items_product" ON "public"."invoice_items" USING "btree" ("product_id");


--
-- Name: idx_invoices_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_invoices_date" ON "public"."invoices" USING "btree" ("invoice_date");


--
-- Name: idx_invoices_number; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_invoices_number" ON "public"."invoices" USING "btree" ("invoice_number");


--
-- Name: idx_invoices_supplier; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_invoices_supplier" ON "public"."invoices" USING "btree" ("supplier_id");


--
-- Name: idx_maintenance_work_orders_number; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_maintenance_work_orders_number" ON "public"."maintenance_work_orders" USING "btree" ("work_order_number");


--
-- Name: idx_maintenance_work_orders_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_maintenance_work_orders_status" ON "public"."maintenance_work_orders" USING "btree" ("status");


--
-- Name: idx_medical_waste_auto_generated; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_medical_waste_auto_generated" ON "public"."medical_waste" USING "btree" ("auto_generated", "source_batch_id");


--
-- Name: idx_medical_waste_source_product; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_medical_waste_source_product" ON "public"."medical_waste" USING "btree" ("source_product_id");


--
-- Name: idx_milk_composition_tests_dates; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_milk_composition_tests_dates" ON "public"."milk_composition_tests" USING "btree" ("paemimo_data", "tyrimo_data");


--
-- Name: idx_milk_composition_tests_konteineris; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_milk_composition_tests_konteineris" ON "public"."milk_composition_tests" USING "btree" ("konteineris");


--
-- Name: idx_milk_composition_tests_milk_weight_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_milk_composition_tests_milk_weight_id" ON "public"."milk_composition_tests" USING "btree" ("milk_weight_id");


--
-- Name: idx_milk_composition_tests_producer_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_milk_composition_tests_producer_id" ON "public"."milk_composition_tests" USING "btree" ("producer_id");


--
-- Name: idx_milk_composition_tests_scrape_session_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_milk_composition_tests_scrape_session_id" ON "public"."milk_composition_tests" USING "btree" ("scrape_session_id");


--
-- Name: idx_milk_producers_gamintojo_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_milk_producers_gamintojo_id" ON "public"."milk_producers" USING "btree" ("gamintojo_id");


--
-- Name: idx_milk_production_animal; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_milk_production_animal" ON "public"."milk_production" USING "btree" ("animal_id");


--
-- Name: idx_milk_production_animal_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_milk_production_animal_date" ON "public"."milk_production" USING "btree" ("animal_id", "measurement_date" DESC);


--
-- Name: idx_milk_production_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_milk_production_date" ON "public"."milk_production" USING "btree" ("measurement_date" DESC);


--
-- Name: idx_milk_quality_tests_dates; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_milk_quality_tests_dates" ON "public"."milk_quality_tests" USING "btree" ("paemimo_data", "tyrimo_data");


--
-- Name: idx_milk_quality_tests_konteineris; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_milk_quality_tests_konteineris" ON "public"."milk_quality_tests" USING "btree" ("konteineris");


--
-- Name: idx_milk_quality_tests_milk_weight_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_milk_quality_tests_milk_weight_id" ON "public"."milk_quality_tests" USING "btree" ("milk_weight_id");


--
-- Name: idx_milk_quality_tests_producer_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_milk_quality_tests_producer_id" ON "public"."milk_quality_tests" USING "btree" ("producer_id");


--
-- Name: idx_milk_quality_tests_scrape_session_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_milk_quality_tests_scrape_session_id" ON "public"."milk_quality_tests" USING "btree" ("scrape_session_id");


--
-- Name: idx_milk_test_summaries_producer_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_milk_test_summaries_producer_id" ON "public"."milk_test_summaries" USING "btree" ("producer_id");


--
-- Name: idx_milk_test_summaries_scrape_session_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_milk_test_summaries_scrape_session_id" ON "public"."milk_test_summaries" USING "btree" ("scrape_session_id");


--
-- Name: idx_milk_tests_animal; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_milk_tests_animal" ON "public"."milk_tests" USING "btree" ("animal_id");


--
-- Name: idx_milk_tests_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_milk_tests_date" ON "public"."milk_tests" USING "btree" ("test_date" DESC);


--
-- Name: idx_milk_tests_sample_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_milk_tests_sample_date" ON "public"."milk_tests" USING "btree" ("sample_date" DESC);


--
-- Name: idx_milk_tests_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_milk_tests_status" ON "public"."milk_tests" USING "btree" ("test_status");


--
-- Name: idx_milk_weights_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_milk_weights_date" ON "public"."milk_weights" USING "btree" ("date" DESC);


--
-- Name: idx_milk_weights_events; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_milk_weights_events" ON "public"."milk_weights" USING "btree" ("date" DESC, "session_type", "event_type");


--
-- Name: idx_milk_weights_session; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_milk_weights_session" ON "public"."milk_weights" USING "btree" ("date", "session_type");


--
-- Name: idx_product_quality_reviews_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_product_quality_reviews_date" ON "public"."product_quality_reviews" USING "btree" ("review_date");


--
-- Name: idx_product_quality_reviews_product; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_product_quality_reviews_product" ON "public"."product_quality_reviews" USING "btree" ("product_id");


--
-- Name: idx_product_quality_schedule_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "idx_product_quality_schedule_unique" ON "public"."product_quality_schedules" USING "btree" ("product_id") WHERE ("is_active" = true);


--
-- Name: idx_products_package_weight; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_products_package_weight" ON "public"."products" USING "btree" ("package_weight_g") WHERE ("package_weight_g" IS NOT NULL);


--
-- Name: idx_synchronization_steps_completed; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_synchronization_steps_completed" ON "public"."synchronization_steps" USING "btree" ("completed");


--
-- Name: idx_synchronization_steps_scheduled_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_synchronization_steps_scheduled_date" ON "public"."synchronization_steps" USING "btree" ("scheduled_date");


--
-- Name: idx_synchronization_steps_synchronization_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_synchronization_steps_synchronization_id" ON "public"."synchronization_steps" USING "btree" ("synchronization_id");


--
-- Name: idx_teat_status_animal_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_teat_status_animal_id" ON "public"."teat_status" USING "btree" ("animal_id");


--
-- Name: idx_teat_status_disabled; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_teat_status_disabled" ON "public"."teat_status" USING "btree" ("is_disabled") WHERE ("is_disabled" = true);


--
-- Name: idx_treatments_animal_outcome; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_treatments_animal_outcome" ON "public"."treatments" USING "btree" ("animal_id", "outcome");


--
-- Name: idx_treatments_animal_recent; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_treatments_animal_recent" ON "public"."treatments" USING "btree" ("animal_id", "reg_date");


--
-- Name: idx_treatments_animal_teat; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_treatments_animal_teat" ON "public"."treatments" USING "btree" ("animal_id", "mastitis_teat") WHERE ("mastitis_teat" IS NOT NULL);


--
-- Name: idx_treatments_animal_withdrawal; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_treatments_animal_withdrawal" ON "public"."treatments" USING "btree" ("animal_id", "withdrawal_until_milk", "withdrawal_until_meat");


--
-- Name: idx_treatments_visit_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_treatments_visit_id" ON "public"."treatments" USING "btree" ("visit_id");


--
-- Name: idx_usage_items_product; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_usage_items_product" ON "public"."usage_items" USING "btree" ("product_id");


--
-- Name: idx_usage_items_treatment; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_usage_items_treatment" ON "public"."usage_items" USING "btree" ("treatment_id");


--
-- Name: idx_usage_items_vaccination_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_usage_items_vaccination_id" ON "public"."usage_items" USING "btree" ("vaccination_id");


--
-- Name: idx_vaccinations_animal; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_vaccinations_animal" ON "public"."vaccinations" USING "btree" ("animal_id");


--
-- Name: idx_vaccinations_animal_recent; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_vaccinations_animal_recent" ON "public"."vaccinations" USING "btree" ("animal_id", "vaccination_date");


--
-- Name: idx_vaccinations_booster; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_vaccinations_booster" ON "public"."vaccinations" USING "btree" ("next_booster_date");


--
-- Name: idx_vaccinations_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_vaccinations_date" ON "public"."vaccinations" USING "btree" ("vaccination_date");


--
-- Name: idx_vehicle_documents_expiry_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_vehicle_documents_expiry_date" ON "public"."vehicle_documents" USING "btree" ("expiry_date");


--
-- Name: idx_vehicle_documents_vehicle_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_vehicle_documents_vehicle_id" ON "public"."vehicle_documents" USING "btree" ("vehicle_id");


--
-- Name: idx_vehicle_service_visits_datetime; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_vehicle_service_visits_datetime" ON "public"."vehicle_service_visits" USING "btree" ("visit_datetime");


--
-- Name: idx_vehicle_service_visits_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_vehicle_service_visits_status" ON "public"."vehicle_service_visits" USING "btree" ("status");


--
-- Name: idx_vehicle_service_visits_vehicle_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_vehicle_service_visits_vehicle_id" ON "public"."vehicle_service_visits" USING "btree" ("vehicle_id");


--
-- Name: idx_vehicle_visit_parts_visit_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_vehicle_visit_parts_visit_id" ON "public"."vehicle_visit_parts" USING "btree" ("visit_id");


--
-- Name: idx_work_orders_schedule; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_work_orders_schedule" ON "public"."maintenance_work_orders" USING "btree" ("schedule_id");


--
-- Name: idx_worker_schedules_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_worker_schedules_date" ON "public"."worker_schedules" USING "btree" ("date");


--
-- Name: idx_worker_schedules_worker_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_worker_schedules_worker_date" ON "public"."worker_schedules" USING "btree" ("worker_id", "date");


--
-- Name: products_name_cat_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "products_name_cat_idx" ON "public"."products" USING "btree" ("lower"("name"), "category");


--
-- Name: treatments_reg_date_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "treatments_reg_date_idx" ON "public"."treatments" USING "btree" ("reg_date");


--
-- Name: uq_gea_a1_import_cow; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "uq_gea_a1_import_cow" ON "public"."gea_daily_ataskaita1" USING "btree" ("import_id", "cow_number");


--
-- Name: uq_gea_a2_import_cow; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "uq_gea_a2_import_cow" ON "public"."gea_daily_ataskaita2" USING "btree" ("import_id", "cow_number");


--
-- Name: uq_gea_a3_import_cow; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "uq_gea_a3_import_cow" ON "public"."gea_daily_ataskaita3" USING "btree" ("import_id", "cow_number");


--
-- Name: usage_items_batch_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "usage_items_batch_idx" ON "public"."usage_items" USING "btree" ("batch_id");


--
-- Name: usage_items_product_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "usage_items_product_idx" ON "public"."usage_items" USING "btree" ("product_id");


--
-- Name: usage_items a_auto_split_usage_items; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "a_auto_split_usage_items" BEFORE INSERT ON "public"."usage_items" FOR EACH ROW EXECUTE FUNCTION "public"."auto_split_usage_items"();


--
-- Name: treatment_courses auto_calculate_withdrawal_on_course; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "auto_calculate_withdrawal_on_course" AFTER INSERT OR UPDATE ON "public"."treatment_courses" FOR EACH ROW WHEN (("new"."treatment_id" IS NOT NULL)) EXECUTE FUNCTION "public"."trigger_calculate_withdrawal_on_usage"();


--
-- Name: usage_items auto_calculate_withdrawal_on_usage; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "auto_calculate_withdrawal_on_usage" AFTER INSERT OR UPDATE ON "public"."usage_items" FOR EACH ROW WHEN (("new"."treatment_id" IS NOT NULL)) EXECUTE FUNCTION "public"."trigger_calculate_withdrawal_on_usage"();


--
-- Name: animal_visits auto_process_visit_medications; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "auto_process_visit_medications" BEFORE UPDATE ON "public"."animal_visits" FOR EACH ROW EXECUTE FUNCTION "public"."process_visit_medications"();


--
-- Name: work_order_parts deduct_parts_from_inventory; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "deduct_parts_from_inventory" AFTER INSERT ON "public"."work_order_parts" FOR EACH ROW EXECUTE FUNCTION "public"."deduct_work_order_parts"();


--
-- Name: farm_equipment_items farm_equipment_items_update_next_service; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "farm_equipment_items_update_next_service" BEFORE INSERT OR UPDATE OF "last_service_date", "service_interval_value", "service_interval_type" ON "public"."farm_equipment_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_farm_equipment_item_next_service_date"();


--
-- Name: farm_equipment_service_records farm_equipment_service_records_update_last_service; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "farm_equipment_service_records_update_last_service" AFTER INSERT ON "public"."farm_equipment_service_records" FOR EACH ROW EXECUTE FUNCTION "public"."update_last_service_date_on_new_record"();


--
-- Name: farm_equipment_service_records farm_equipment_service_records_update_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "farm_equipment_service_records_update_timestamp" BEFORE UPDATE ON "public"."farm_equipment_service_records" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: farm_equipment farm_equipment_update_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "farm_equipment_update_timestamp" BEFORE UPDATE ON "public"."farm_equipment" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: fire_extinguishers fire_extinguishers_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "fire_extinguishers_updated_at" BEFORE UPDATE ON "public"."fire_extinguishers" FOR EACH ROW EXECUTE FUNCTION "public"."update_fire_extinguishers_updated_at"();


--
-- Name: users set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();


--
-- Name: animal_synchronizations set_updated_at_animal_synchronizations; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "set_updated_at_animal_synchronizations" BEFORE UPDATE ON "public"."animal_synchronizations" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();


--
-- Name: animal_visits set_updated_at_animal_visits; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "set_updated_at_animal_visits" BEFORE UPDATE ON "public"."animal_visits" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();


--
-- Name: animals set_updated_at_animals; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "set_updated_at_animals" BEFORE UPDATE ON "public"."animals" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_timestamp"();


--
-- Name: batch_waste_tracking set_updated_at_batch_waste_tracking; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "set_updated_at_batch_waste_tracking" BEFORE UPDATE ON "public"."batch_waste_tracking" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_timestamp"();


--
-- Name: batches set_updated_at_batches; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "set_updated_at_batches" BEFORE UPDATE ON "public"."batches" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_timestamp"();


--
-- Name: biocide_usage set_updated_at_biocide_usage; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "set_updated_at_biocide_usage" BEFORE UPDATE ON "public"."biocide_usage" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_timestamp"();


--
-- Name: course_doses set_updated_at_course_doses; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "set_updated_at_course_doses" BEFORE UPDATE ON "public"."course_doses" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_timestamp"();


--
-- Name: course_medication_schedules set_updated_at_course_medication_schedules; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "set_updated_at_course_medication_schedules" BEFORE UPDATE ON "public"."course_medication_schedules" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_timestamp"();


--
-- Name: diseases set_updated_at_diseases; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "set_updated_at_diseases" BEFORE UPDATE ON "public"."diseases" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_timestamp"();


--
-- Name: hoof_condition_codes set_updated_at_hoof_condition_codes; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "set_updated_at_hoof_condition_codes" BEFORE UPDATE ON "public"."hoof_condition_codes" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_timestamp"();


--
-- Name: hoof_records set_updated_at_hoof_records; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "set_updated_at_hoof_records" BEFORE UPDATE ON "public"."hoof_records" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_timestamp"();


--
-- Name: insemination_inventory set_updated_at_insemination_inventory; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "set_updated_at_insemination_inventory" BEFORE UPDATE ON "public"."insemination_inventory" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_timestamp"();


--
-- Name: insemination_products set_updated_at_insemination_products; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "set_updated_at_insemination_products" BEFORE UPDATE ON "public"."insemination_products" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_timestamp"();


--
-- Name: insemination_records set_updated_at_insemination_records; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "set_updated_at_insemination_records" BEFORE UPDATE ON "public"."insemination_records" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_timestamp"();


--
-- Name: invoice_items set_updated_at_invoice_items; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "set_updated_at_invoice_items" BEFORE UPDATE ON "public"."invoice_items" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_timestamp"();


--
-- Name: invoices set_updated_at_invoices; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "set_updated_at_invoices" BEFORE UPDATE ON "public"."invoices" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_timestamp"();


--
-- Name: medical_waste set_updated_at_medical_waste; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "set_updated_at_medical_waste" BEFORE UPDATE ON "public"."medical_waste" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_timestamp"();


--
-- Name: products set_updated_at_products; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "set_updated_at_products" BEFORE UPDATE ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_timestamp"();


--
-- Name: shared_notepad set_updated_at_shared_notepad; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "set_updated_at_shared_notepad" BEFORE UPDATE ON "public"."shared_notepad" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_timestamp"();


--
-- Name: suppliers set_updated_at_suppliers; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "set_updated_at_suppliers" BEFORE UPDATE ON "public"."suppliers" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_timestamp"();


--
-- Name: synchronization_protocols set_updated_at_synchronization_protocols; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "set_updated_at_synchronization_protocols" BEFORE UPDATE ON "public"."synchronization_protocols" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();


--
-- Name: synchronization_steps set_updated_at_synchronization_steps; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "set_updated_at_synchronization_steps" BEFORE UPDATE ON "public"."synchronization_steps" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();


--
-- Name: system_settings set_updated_at_system_settings; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "set_updated_at_system_settings" BEFORE UPDATE ON "public"."system_settings" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_timestamp"();


--
-- Name: teat_status set_updated_at_teat_status; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "set_updated_at_teat_status" BEFORE UPDATE ON "public"."teat_status" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_timestamp"();


--
-- Name: treatment_courses set_updated_at_treatment_courses; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "set_updated_at_treatment_courses" BEFORE UPDATE ON "public"."treatment_courses" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_timestamp"();


--
-- Name: treatments set_updated_at_treatments; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "set_updated_at_treatments" BEFORE UPDATE ON "public"."treatments" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_timestamp"();


--
-- Name: usage_items set_updated_at_usage_items; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "set_updated_at_usage_items" BEFORE UPDATE ON "public"."usage_items" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_timestamp"();


--
-- Name: user_audit_logs set_updated_at_user_audit_logs; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "set_updated_at_user_audit_logs" BEFORE UPDATE ON "public"."user_audit_logs" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_timestamp"();


--
-- Name: users set_updated_at_users; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "set_updated_at_users" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_timestamp"();


--
-- Name: vaccinations set_updated_at_vaccinations; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "set_updated_at_vaccinations" BEFORE UPDATE ON "public"."vaccinations" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_timestamp"();


--
-- Name: maintenance_work_orders set_work_order_number; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "set_work_order_number" BEFORE INSERT ON "public"."maintenance_work_orders" FOR EACH ROW EXECUTE FUNCTION "public"."set_work_order_number_trigger"();


--
-- Name: teat_status teat_status_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "teat_status_updated_at" BEFORE UPDATE ON "public"."teat_status" FOR EACH ROW EXECUTE FUNCTION "public"."update_teat_status_updated_at"();


--
-- Name: usage_items trg_check_usage; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_check_usage" BEFORE INSERT OR UPDATE ON "public"."usage_items" FOR EACH ROW EXECUTE FUNCTION "public"."fn_check_usage_constraints"();


--
-- Name: synchronization_steps trg_sync_step_stock_deduction; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_sync_step_stock_deduction" AFTER UPDATE OF "completed" ON "public"."synchronization_steps" FOR EACH ROW EXECUTE FUNCTION "public"."deduct_sync_step_medication"();


--
-- Name: milk_composition_tests trigger_auto_link_composition_test; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trigger_auto_link_composition_test" BEFORE INSERT OR UPDATE ON "public"."milk_composition_tests" FOR EACH ROW EXECUTE FUNCTION "public"."auto_link_milk_test_to_weight"();


--
-- Name: milk_quality_tests trigger_auto_link_quality_test; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trigger_auto_link_quality_test" BEFORE INSERT OR UPDATE ON "public"."milk_quality_tests" FOR EACH ROW EXECUTE FUNCTION "public"."auto_link_milk_test_to_weight"();


--
-- Name: batches trigger_calculate_received_qty; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trigger_calculate_received_qty" BEFORE INSERT OR UPDATE ON "public"."batches" FOR EACH ROW EXECUTE FUNCTION "public"."calculate_received_qty"();


--
-- Name: usage_items trigger_check_batch_depletion; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trigger_check_batch_depletion" AFTER INSERT ON "public"."usage_items" FOR EACH ROW EXECUTE FUNCTION "public"."check_batch_depletion"();


--
-- Name: course_doses trigger_check_course_completion; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trigger_check_course_completion" AFTER UPDATE ON "public"."course_doses" FOR EACH ROW WHEN ((("new"."administered_date" IS NOT NULL) AND ("old"."administered_date" IS NULL))) EXECUTE FUNCTION "public"."check_course_completion"();


--
-- Name: treatment_courses trigger_create_course_doses; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trigger_create_course_doses" AFTER INSERT ON "public"."treatment_courses" FOR EACH ROW EXECUTE FUNCTION "public"."create_course_doses"();


--
-- Name: vaccinations trigger_create_usage_from_vaccination; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trigger_create_usage_from_vaccination" AFTER INSERT ON "public"."vaccinations" FOR EACH ROW EXECUTE FUNCTION "public"."create_usage_item_from_vaccination"();


--
-- Name: equipment_issuance_items trigger_deduct_equipment_stock; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trigger_deduct_equipment_stock" AFTER INSERT ON "public"."equipment_issuance_items" FOR EACH ROW EXECUTE FUNCTION "public"."deduct_equipment_stock"();


--
-- Name: farm_equipment_service_parts trigger_deduct_farm_equipment_service_stock; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trigger_deduct_farm_equipment_service_stock" AFTER INSERT ON "public"."farm_equipment_service_parts" FOR EACH ROW EXECUTE FUNCTION "public"."deduct_farm_equipment_service_stock"();


--
-- Name: batches trigger_initialize_batch_fields; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trigger_initialize_batch_fields" BEFORE INSERT ON "public"."batches" FOR EACH ROW EXECUTE FUNCTION "public"."initialize_batch_fields"();


--
-- Name: animal_visits trigger_process_visit_medications; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trigger_process_visit_medications" BEFORE UPDATE ON "public"."animal_visits" FOR EACH ROW EXECUTE FUNCTION "public"."process_visit_medications"();


--
-- Name: equipment_issuance_items trigger_restore_equipment_stock; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trigger_restore_equipment_stock" AFTER UPDATE OF "quantity_returned" ON "public"."equipment_issuance_items" FOR EACH ROW WHEN (("new"."quantity_returned" IS DISTINCT FROM "old"."quantity_returned")) EXECUTE FUNCTION "public"."restore_equipment_stock"();


--
-- Name: biocide_usage trigger_sync_biocide_to_stock; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trigger_sync_biocide_to_stock" AFTER INSERT ON "public"."biocide_usage" FOR EACH ROW EXECUTE FUNCTION "public"."sync_biocide_usage_to_stock"();


--
-- Name: TRIGGER "trigger_sync_biocide_to_stock" ON "biocide_usage"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TRIGGER "trigger_sync_biocide_to_stock" ON "public"."biocide_usage" IS 'Ensures prevention products (biocide_usage) deduct from stock by creating usage_items entries';


--
-- Name: usage_items trigger_update_batch_qty_left; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trigger_update_batch_qty_left" AFTER INSERT ON "public"."usage_items" FOR EACH ROW WHEN (("new"."batch_id" IS NOT NULL)) EXECUTE FUNCTION "public"."update_batch_qty_left"();


--
-- Name: hoof_records trigger_update_hoof_records_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trigger_update_hoof_records_updated_at" BEFORE UPDATE ON "public"."hoof_records" FOR EACH ROW EXECUTE FUNCTION "public"."update_hoof_records_updated_at"();


--
-- Name: maintenance_work_orders trigger_update_schedule_on_complete; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trigger_update_schedule_on_complete" AFTER INSERT OR UPDATE OF "status" ON "public"."maintenance_work_orders" FOR EACH ROW EXECUTE FUNCTION "public"."update_schedule_on_work_order_complete"();


--
-- Name: shared_notepad trigger_update_shared_notepad_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trigger_update_shared_notepad_updated_at" BEFORE UPDATE ON "public"."shared_notepad" FOR EACH ROW EXECUTE FUNCTION "public"."update_shared_notepad_updated_at"();


--
-- Name: vehicle_service_visits trigger_update_vehicle_last_service; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trigger_update_vehicle_last_service" AFTER INSERT OR UPDATE ON "public"."vehicle_service_visits" FOR EACH ROW EXECUTE FUNCTION "public"."update_vehicle_last_service"();


--
-- Name: vehicle_visit_parts trigger_vehicle_visit_part_stock_deduction; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trigger_vehicle_visit_part_stock_deduction" BEFORE INSERT ON "public"."vehicle_visit_parts" FOR EACH ROW EXECUTE FUNCTION "public"."handle_vehicle_visit_part_stock"();


--
-- Name: vehicle_visit_parts trigger_vehicle_visit_part_stock_restoration; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trigger_vehicle_visit_part_stock_restoration" BEFORE DELETE ON "public"."vehicle_visit_parts" FOR EACH ROW EXECUTE FUNCTION "public"."restore_vehicle_visit_part_stock"();


--
-- Name: cost_accumulation_projects update_cost_accumulation_project_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_cost_accumulation_project_timestamp" BEFORE UPDATE ON "public"."cost_accumulation_projects" FOR EACH ROW EXECUTE FUNCTION "public"."update_cost_accumulation_project_updated_at"();


--
-- Name: cost_centers update_cost_center_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_cost_center_updated_at_trigger" BEFORE UPDATE ON "public"."cost_centers" FOR EACH ROW EXECUTE FUNCTION "public"."update_cost_center_updated_at"();


--
-- Name: work_order_labor update_costs_on_labor; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_costs_on_labor" AFTER INSERT OR DELETE OR UPDATE ON "public"."work_order_labor" FOR EACH ROW EXECUTE FUNCTION "public"."update_work_order_costs"();


--
-- Name: work_order_parts update_costs_on_parts; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_costs_on_parts" AFTER INSERT OR DELETE OR UPDATE ON "public"."work_order_parts" FOR EACH ROW EXECUTE FUNCTION "public"."update_work_order_costs"();


--
-- Name: milk_production update_milk_production_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_milk_production_updated_at" BEFORE UPDATE ON "public"."milk_production" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: milk_tests update_milk_tests_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_milk_tests_updated_at" BEFORE UPDATE ON "public"."milk_tests" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: usage_items usage_items_stock_check_trigger; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "usage_items_stock_check_trigger" BEFORE INSERT ON "public"."usage_items" FOR EACH ROW WHEN (("new"."batch_id" IS NOT NULL)) EXECUTE FUNCTION "public"."check_batch_stock"();


--
-- Name: animal_synchronizations animal_synchronizations_animal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."animal_synchronizations"
    ADD CONSTRAINT "animal_synchronizations_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE CASCADE;


--
-- Name: animal_synchronizations animal_synchronizations_protocol_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."animal_synchronizations"
    ADD CONSTRAINT "animal_synchronizations_protocol_id_fkey" FOREIGN KEY ("protocol_id") REFERENCES "public"."synchronization_protocols"("id") ON DELETE RESTRICT;


--
-- Name: animal_visits animal_visits_animal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."animal_visits"
    ADD CONSTRAINT "animal_visits_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE CASCADE;


--
-- Name: animal_visits animal_visits_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."animal_visits"
    ADD CONSTRAINT "animal_visits_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."treatment_courses"("id") ON DELETE SET NULL;


--
-- Name: animal_visits animal_visits_related_treatment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."animal_visits"
    ADD CONSTRAINT "animal_visits_related_treatment_id_fkey" FOREIGN KEY ("related_treatment_id") REFERENCES "public"."treatments"("id") ON DELETE SET NULL;


--
-- Name: animal_visits animal_visits_related_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."animal_visits"
    ADD CONSTRAINT "animal_visits_related_visit_id_fkey" FOREIGN KEY ("related_visit_id") REFERENCES "public"."animal_visits"("id") ON DELETE SET NULL;


--
-- Name: animal_visits animal_visits_sync_step_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."animal_visits"
    ADD CONSTRAINT "animal_visits_sync_step_id_fkey" FOREIGN KEY ("sync_step_id") REFERENCES "public"."synchronization_steps"("id") ON DELETE SET NULL;


--
-- Name: batch_waste_tracking batch_waste_tracking_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."batch_waste_tracking"
    ADD CONSTRAINT "batch_waste_tracking_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE CASCADE;


--
-- Name: batch_waste_tracking batch_waste_tracking_medical_waste_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."batch_waste_tracking"
    ADD CONSTRAINT "batch_waste_tracking_medical_waste_id_fkey" FOREIGN KEY ("medical_waste_id") REFERENCES "public"."medical_waste"("id") ON DELETE CASCADE;


--
-- Name: batches batches_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."batches"
    ADD CONSTRAINT "batches_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE SET NULL;


--
-- Name: batches batches_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."batches"
    ADD CONSTRAINT "batches_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;


--
-- Name: batches batches_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."batches"
    ADD CONSTRAINT "batches_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id");


--
-- Name: biocide_usage biocide_usage_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."biocide_usage"
    ADD CONSTRAINT "biocide_usage_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id");


--
-- Name: biocide_usage biocide_usage_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."biocide_usage"
    ADD CONSTRAINT "biocide_usage_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");


--
-- Name: cost_accumulation_documents cost_accumulation_documents_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."cost_accumulation_documents"
    ADD CONSTRAINT "cost_accumulation_documents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."cost_accumulation_projects"("id") ON DELETE CASCADE;


--
-- Name: cost_accumulation_documents cost_accumulation_documents_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."cost_accumulation_documents"
    ADD CONSTRAINT "cost_accumulation_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: cost_accumulation_items cost_accumulation_items_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."cost_accumulation_items"
    ADD CONSTRAINT "cost_accumulation_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: cost_accumulation_items cost_accumulation_items_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."cost_accumulation_items"
    ADD CONSTRAINT "cost_accumulation_items_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."cost_accumulation_documents"("id") ON DELETE CASCADE;


--
-- Name: cost_accumulation_items cost_accumulation_items_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."cost_accumulation_items"
    ADD CONSTRAINT "cost_accumulation_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."cost_accumulation_projects"("id") ON DELETE CASCADE;


--
-- Name: cost_accumulation_projects cost_accumulation_projects_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."cost_accumulation_projects"
    ADD CONSTRAINT "cost_accumulation_projects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: cost_centers cost_centers_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."cost_centers"
    ADD CONSTRAINT "cost_centers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: cost_centers cost_centers_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."cost_centers"
    ADD CONSTRAINT "cost_centers_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."cost_centers"("id") ON DELETE CASCADE;


--
-- Name: course_doses course_doses_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_doses"
    ADD CONSTRAINT "course_doses_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."treatment_courses"("id") ON DELETE CASCADE;


--
-- Name: course_medication_schedules course_medication_schedules_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_medication_schedules"
    ADD CONSTRAINT "course_medication_schedules_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id");


--
-- Name: course_medication_schedules course_medication_schedules_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_medication_schedules"
    ADD CONSTRAINT "course_medication_schedules_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."treatment_courses"("id") ON DELETE CASCADE;


--
-- Name: course_medication_schedules course_medication_schedules_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_medication_schedules"
    ADD CONSTRAINT "course_medication_schedules_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");


--
-- Name: course_medication_schedules course_medication_schedules_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_medication_schedules"
    ADD CONSTRAINT "course_medication_schedules_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "public"."animal_visits"("id") ON DELETE SET NULL;


--
-- Name: equipment_batches equipment_batches_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."equipment_batches"
    ADD CONSTRAINT "equipment_batches_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: equipment_batches equipment_batches_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."equipment_batches"
    ADD CONSTRAINT "equipment_batches_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."equipment_invoices"("id");


--
-- Name: equipment_batches equipment_batches_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."equipment_batches"
    ADD CONSTRAINT "equipment_batches_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."equipment_locations"("id");


--
-- Name: equipment_batches equipment_batches_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."equipment_batches"
    ADD CONSTRAINT "equipment_batches_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."equipment_products"("id");


--
-- Name: equipment_categories equipment_categories_parent_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."equipment_categories"
    ADD CONSTRAINT "equipment_categories_parent_category_id_fkey" FOREIGN KEY ("parent_category_id") REFERENCES "public"."equipment_categories"("id");


--
-- Name: equipment_invoice_item_assignments equipment_invoice_item_assignments_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."equipment_invoice_item_assignments"
    ADD CONSTRAINT "equipment_invoice_item_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: equipment_invoice_item_assignments equipment_invoice_item_assignments_cost_center_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."equipment_invoice_item_assignments"
    ADD CONSTRAINT "equipment_invoice_item_assignments_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_centers"("id") ON DELETE SET NULL;


--
-- Name: equipment_invoice_item_assignments equipment_invoice_item_assignments_invoice_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."equipment_invoice_item_assignments"
    ADD CONSTRAINT "equipment_invoice_item_assignments_invoice_item_id_fkey" FOREIGN KEY ("invoice_item_id") REFERENCES "public"."equipment_invoice_items"("id") ON DELETE CASCADE;


--
-- Name: equipment_invoice_item_assignments equipment_invoice_item_assignments_tool_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."equipment_invoice_item_assignments"
    ADD CONSTRAINT "equipment_invoice_item_assignments_tool_id_fkey" FOREIGN KEY ("tool_id") REFERENCES "public"."tools"("id") ON DELETE SET NULL;


--
-- Name: equipment_invoice_item_assignments equipment_invoice_item_assignments_vehicle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."equipment_invoice_item_assignments"
    ADD CONSTRAINT "equipment_invoice_item_assignments_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE SET NULL;


--
-- Name: equipment_invoice_items equipment_invoice_items_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."equipment_invoice_items"
    ADD CONSTRAINT "equipment_invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."equipment_invoices"("id") ON DELETE CASCADE;


--
-- Name: equipment_invoice_items equipment_invoice_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."equipment_invoice_items"
    ADD CONSTRAINT "equipment_invoice_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."equipment_products"("id");


--
-- Name: equipment_invoices equipment_invoices_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."equipment_invoices"
    ADD CONSTRAINT "equipment_invoices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: equipment_invoices equipment_invoices_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."equipment_invoices"
    ADD CONSTRAINT "equipment_invoices_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."equipment_suppliers"("id");


--
-- Name: equipment_issuance_items equipment_issuance_items_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."equipment_issuance_items"
    ADD CONSTRAINT "equipment_issuance_items_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."equipment_batches"("id");


--
-- Name: equipment_issuance_items equipment_issuance_items_issuance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."equipment_issuance_items"
    ADD CONSTRAINT "equipment_issuance_items_issuance_id_fkey" FOREIGN KEY ("issuance_id") REFERENCES "public"."equipment_issuances"("id") ON DELETE CASCADE;


--
-- Name: equipment_issuance_items equipment_issuance_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."equipment_issuance_items"
    ADD CONSTRAINT "equipment_issuance_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."equipment_products"("id");


--
-- Name: equipment_issuances equipment_issuances_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."equipment_issuances"
    ADD CONSTRAINT "equipment_issuances_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");


--
-- Name: equipment_issuances equipment_issuances_issued_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."equipment_issuances"
    ADD CONSTRAINT "equipment_issuances_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id");


--
-- Name: equipment_issuances equipment_issuances_issued_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."equipment_issuances"
    ADD CONSTRAINT "equipment_issuances_issued_to_fkey" FOREIGN KEY ("issued_to") REFERENCES "public"."users"("id");


--
-- Name: equipment_products equipment_products_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."equipment_products"
    ADD CONSTRAINT "equipment_products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."equipment_categories"("id");


--
-- Name: equipment_stock_movements equipment_stock_movements_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."equipment_stock_movements"
    ADD CONSTRAINT "equipment_stock_movements_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."equipment_batches"("id");


--
-- Name: equipment_stock_movements equipment_stock_movements_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."equipment_stock_movements"
    ADD CONSTRAINT "equipment_stock_movements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");


--
-- Name: equipment_suppliers equipment_suppliers_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."equipment_suppliers"
    ADD CONSTRAINT "equipment_suppliers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: farm_equipment_items farm_equipment_items_farm_equipment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."farm_equipment_items"
    ADD CONSTRAINT "farm_equipment_items_farm_equipment_id_fkey" FOREIGN KEY ("farm_equipment_id") REFERENCES "public"."farm_equipment"("id") ON DELETE CASCADE;


--
-- Name: farm_equipment_service_parts farm_equipment_service_parts_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."farm_equipment_service_parts"
    ADD CONSTRAINT "farm_equipment_service_parts_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."equipment_batches"("id") ON DELETE CASCADE;


--
-- Name: farm_equipment_service_parts farm_equipment_service_parts_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."farm_equipment_service_parts"
    ADD CONSTRAINT "farm_equipment_service_parts_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."equipment_products"("id");


--
-- Name: farm_equipment_service_parts farm_equipment_service_parts_service_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."farm_equipment_service_parts"
    ADD CONSTRAINT "farm_equipment_service_parts_service_record_id_fkey" FOREIGN KEY ("service_record_id") REFERENCES "public"."farm_equipment_service_records"("id") ON DELETE CASCADE;


--
-- Name: farm_equipment_service_records farm_equipment_service_records_farm_equipment_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."farm_equipment_service_records"
    ADD CONSTRAINT "farm_equipment_service_records_farm_equipment_item_id_fkey" FOREIGN KEY ("farm_equipment_item_id") REFERENCES "public"."farm_equipment_items"("id") ON DELETE CASCADE;


--
-- Name: fire_extinguishers fire_extinguishers_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."fire_extinguishers"
    ADD CONSTRAINT "fire_extinguishers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: fire_extinguishers fire_extinguishers_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."fire_extinguishers"
    ADD CONSTRAINT "fire_extinguishers_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."equipment_locations"("id") ON DELETE SET NULL;


--
-- Name: fire_extinguishers fire_extinguishers_vehicle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."fire_extinguishers"
    ADD CONSTRAINT "fire_extinguishers_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE SET NULL;


--
-- Name: gea_daily_ataskaita1 gea_daily_ataskaita1_import_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."gea_daily_ataskaita1"
    ADD CONSTRAINT "gea_daily_ataskaita1_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "public"."gea_daily_imports"("id") ON DELETE CASCADE;


--
-- Name: gea_daily_ataskaita2 gea_daily_ataskaita2_import_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."gea_daily_ataskaita2"
    ADD CONSTRAINT "gea_daily_ataskaita2_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "public"."gea_daily_imports"("id") ON DELETE CASCADE;


--
-- Name: gea_daily_ataskaita3 gea_daily_ataskaita3_import_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."gea_daily_ataskaita3"
    ADD CONSTRAINT "gea_daily_ataskaita3_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "public"."gea_daily_imports"("id") ON DELETE CASCADE;


--
-- Name: gea_daily_imports gea_daily_imports_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."gea_daily_imports"
    ADD CONSTRAINT "gea_daily_imports_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: hoof_records hoof_records_animal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."hoof_records"
    ADD CONSTRAINT "hoof_records_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE CASCADE;


--
-- Name: hoof_records hoof_records_condition_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."hoof_records"
    ADD CONSTRAINT "hoof_records_condition_code_fkey" FOREIGN KEY ("condition_code") REFERENCES "public"."hoof_condition_codes"("code");


--
-- Name: hoof_records hoof_records_treatment_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."hoof_records"
    ADD CONSTRAINT "hoof_records_treatment_batch_id_fkey" FOREIGN KEY ("treatment_batch_id") REFERENCES "public"."batches"("id") ON DELETE SET NULL;


--
-- Name: hoof_records hoof_records_treatment_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."hoof_records"
    ADD CONSTRAINT "hoof_records_treatment_product_id_fkey" FOREIGN KEY ("treatment_product_id") REFERENCES "public"."products"("id") ON DELETE SET NULL;


--
-- Name: hoof_records hoof_records_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."hoof_records"
    ADD CONSTRAINT "hoof_records_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "public"."animal_visits"("id") ON DELETE SET NULL;


--
-- Name: insemination_inventory insemination_inventory_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."insemination_inventory"
    ADD CONSTRAINT "insemination_inventory_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."insemination_products"("id") ON DELETE CASCADE;


--
-- Name: insemination_records insemination_records_animal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."insemination_records"
    ADD CONSTRAINT "insemination_records_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE CASCADE;


--
-- Name: insemination_records insemination_records_glove_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."insemination_records"
    ADD CONSTRAINT "insemination_records_glove_product_id_fkey" FOREIGN KEY ("glove_product_id") REFERENCES "public"."insemination_products"("id");


--
-- Name: insemination_records insemination_records_sperm_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."insemination_records"
    ADD CONSTRAINT "insemination_records_sperm_product_id_fkey" FOREIGN KEY ("sperm_product_id") REFERENCES "public"."insemination_products"("id");


--
-- Name: invoice_items invoice_items_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."invoice_items"
    ADD CONSTRAINT "invoice_items_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE SET NULL;


--
-- Name: invoice_items invoice_items_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."invoice_items"
    ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE CASCADE;


--
-- Name: invoice_items invoice_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."invoice_items"
    ADD CONSTRAINT "invoice_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE SET NULL;


--
-- Name: invoices invoices_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: invoices invoices_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE SET NULL;


--
-- Name: maintenance_schedules maintenance_schedules_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."maintenance_schedules"
    ADD CONSTRAINT "maintenance_schedules_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");


--
-- Name: maintenance_schedules maintenance_schedules_vehicle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."maintenance_schedules"
    ADD CONSTRAINT "maintenance_schedules_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id");


--
-- Name: maintenance_work_orders maintenance_work_orders_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."maintenance_work_orders"
    ADD CONSTRAINT "maintenance_work_orders_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id");


--
-- Name: maintenance_work_orders maintenance_work_orders_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."maintenance_work_orders"
    ADD CONSTRAINT "maintenance_work_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");


--
-- Name: maintenance_work_orders maintenance_work_orders_schedule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."maintenance_work_orders"
    ADD CONSTRAINT "maintenance_work_orders_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."maintenance_schedules"("id");


--
-- Name: maintenance_work_orders maintenance_work_orders_service_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."maintenance_work_orders"
    ADD CONSTRAINT "maintenance_work_orders_service_visit_id_fkey" FOREIGN KEY ("service_visit_id") REFERENCES "public"."vehicle_service_visits"("id");


--
-- Name: maintenance_work_orders maintenance_work_orders_tool_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."maintenance_work_orders"
    ADD CONSTRAINT "maintenance_work_orders_tool_id_fkey" FOREIGN KEY ("tool_id") REFERENCES "public"."tools"("id");


--
-- Name: maintenance_work_orders maintenance_work_orders_vehicle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."maintenance_work_orders"
    ADD CONSTRAINT "maintenance_work_orders_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id");


--
-- Name: medical_waste medical_waste_source_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."medical_waste"
    ADD CONSTRAINT "medical_waste_source_batch_id_fkey" FOREIGN KEY ("source_batch_id") REFERENCES "public"."batches"("id") ON DELETE SET NULL;


--
-- Name: medical_waste medical_waste_source_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."medical_waste"
    ADD CONSTRAINT "medical_waste_source_product_id_fkey" FOREIGN KEY ("source_product_id") REFERENCES "public"."products"("id") ON DELETE SET NULL;


--
-- Name: milk_composition_tests milk_composition_tests_milk_weight_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."milk_composition_tests"
    ADD CONSTRAINT "milk_composition_tests_milk_weight_id_fkey" FOREIGN KEY ("milk_weight_id") REFERENCES "public"."milk_weights"("id") ON DELETE SET NULL;


--
-- Name: milk_composition_tests milk_composition_tests_producer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."milk_composition_tests"
    ADD CONSTRAINT "milk_composition_tests_producer_id_fkey" FOREIGN KEY ("producer_id") REFERENCES "public"."milk_producers"("id") ON DELETE CASCADE;


--
-- Name: milk_composition_tests milk_composition_tests_scrape_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."milk_composition_tests"
    ADD CONSTRAINT "milk_composition_tests_scrape_session_id_fkey" FOREIGN KEY ("scrape_session_id") REFERENCES "public"."milk_scrape_sessions"("id") ON DELETE CASCADE;


--
-- Name: milk_production milk_production_animal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."milk_production"
    ADD CONSTRAINT "milk_production_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE CASCADE;


--
-- Name: milk_quality_tests milk_quality_tests_milk_weight_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."milk_quality_tests"
    ADD CONSTRAINT "milk_quality_tests_milk_weight_id_fkey" FOREIGN KEY ("milk_weight_id") REFERENCES "public"."milk_weights"("id") ON DELETE SET NULL;


--
-- Name: milk_quality_tests milk_quality_tests_producer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."milk_quality_tests"
    ADD CONSTRAINT "milk_quality_tests_producer_id_fkey" FOREIGN KEY ("producer_id") REFERENCES "public"."milk_producers"("id") ON DELETE CASCADE;


--
-- Name: milk_quality_tests milk_quality_tests_scrape_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."milk_quality_tests"
    ADD CONSTRAINT "milk_quality_tests_scrape_session_id_fkey" FOREIGN KEY ("scrape_session_id") REFERENCES "public"."milk_scrape_sessions"("id") ON DELETE CASCADE;


--
-- Name: milk_test_summaries milk_test_summaries_producer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."milk_test_summaries"
    ADD CONSTRAINT "milk_test_summaries_producer_id_fkey" FOREIGN KEY ("producer_id") REFERENCES "public"."milk_producers"("id") ON DELETE CASCADE;


--
-- Name: milk_test_summaries milk_test_summaries_scrape_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."milk_test_summaries"
    ADD CONSTRAINT "milk_test_summaries_scrape_session_id_fkey" FOREIGN KEY ("scrape_session_id") REFERENCES "public"."milk_scrape_sessions"("id") ON DELETE CASCADE;


--
-- Name: milk_tests milk_tests_animal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."milk_tests"
    ADD CONSTRAINT "milk_tests_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE CASCADE;


--
-- Name: ppe_issuance_records ppe_issuance_records_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ppe_issuance_records"
    ADD CONSTRAINT "ppe_issuance_records_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "auth"."users"("id");


--
-- Name: ppe_issuance_records ppe_issuance_records_issued_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ppe_issuance_records"
    ADD CONSTRAINT "ppe_issuance_records_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "auth"."users"("id");


--
-- Name: ppe_issuance_records ppe_issuance_records_ppe_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ppe_issuance_records"
    ADD CONSTRAINT "ppe_issuance_records_ppe_item_id_fkey" FOREIGN KEY ("ppe_item_id") REFERENCES "public"."ppe_items"("id");


--
-- Name: ppe_issuance_records ppe_issuance_records_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ppe_issuance_records"
    ADD CONSTRAINT "ppe_issuance_records_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."equipment_products"("id");


--
-- Name: ppe_items ppe_items_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ppe_items"
    ADD CONSTRAINT "ppe_items_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."equipment_locations"("id");


--
-- Name: ppe_items ppe_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ppe_items"
    ADD CONSTRAINT "ppe_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."equipment_products"("id");


--
-- Name: product_quality_reviews product_quality_reviews_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_quality_reviews"
    ADD CONSTRAINT "product_quality_reviews_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: product_quality_reviews product_quality_reviews_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_quality_reviews"
    ADD CONSTRAINT "product_quality_reviews_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."equipment_products"("id") ON DELETE CASCADE;


--
-- Name: product_quality_schedules product_quality_schedules_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_quality_schedules"
    ADD CONSTRAINT "product_quality_schedules_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: product_quality_schedules product_quality_schedules_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_quality_schedules"
    ADD CONSTRAINT "product_quality_schedules_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."equipment_products"("id") ON DELETE CASCADE;


--
-- Name: shared_notepad shared_notepad_last_edited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."shared_notepad"
    ADD CONSTRAINT "shared_notepad_last_edited_by_fkey" FOREIGN KEY ("last_edited_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: synchronization_steps synchronization_steps_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."synchronization_steps"
    ADD CONSTRAINT "synchronization_steps_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE SET NULL;


--
-- Name: synchronization_steps synchronization_steps_medication_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."synchronization_steps"
    ADD CONSTRAINT "synchronization_steps_medication_product_id_fkey" FOREIGN KEY ("medication_product_id") REFERENCES "public"."products"("id") ON DELETE SET NULL;


--
-- Name: synchronization_steps synchronization_steps_synchronization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."synchronization_steps"
    ADD CONSTRAINT "synchronization_steps_synchronization_id_fkey" FOREIGN KEY ("synchronization_id") REFERENCES "public"."animal_synchronizations"("id") ON DELETE CASCADE;


--
-- Name: synchronization_steps synchronization_steps_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."synchronization_steps"
    ADD CONSTRAINT "synchronization_steps_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "public"."animal_visits"("id") ON DELETE SET NULL;


--
-- Name: teat_status teat_status_animal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."teat_status"
    ADD CONSTRAINT "teat_status_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE CASCADE;


--
-- Name: tool_movements tool_movements_from_holder_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tool_movements"
    ADD CONSTRAINT "tool_movements_from_holder_fkey" FOREIGN KEY ("from_holder") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: tool_movements tool_movements_from_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tool_movements"
    ADD CONSTRAINT "tool_movements_from_location_id_fkey" FOREIGN KEY ("from_location_id") REFERENCES "public"."equipment_locations"("id");


--
-- Name: tool_movements tool_movements_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tool_movements"
    ADD CONSTRAINT "tool_movements_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: tool_movements tool_movements_to_holder_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tool_movements"
    ADD CONSTRAINT "tool_movements_to_holder_fkey" FOREIGN KEY ("to_holder") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: tool_movements tool_movements_to_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tool_movements"
    ADD CONSTRAINT "tool_movements_to_location_id_fkey" FOREIGN KEY ("to_location_id") REFERENCES "public"."equipment_locations"("id");


--
-- Name: tool_movements tool_movements_tool_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tool_movements"
    ADD CONSTRAINT "tool_movements_tool_id_fkey" FOREIGN KEY ("tool_id") REFERENCES "public"."tools"("id") ON DELETE CASCADE;


--
-- Name: tools tools_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tools"
    ADD CONSTRAINT "tools_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: tools tools_current_holder_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tools"
    ADD CONSTRAINT "tools_current_holder_fkey" FOREIGN KEY ("current_holder") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: tools tools_current_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tools"
    ADD CONSTRAINT "tools_current_location_id_fkey" FOREIGN KEY ("current_location_id") REFERENCES "public"."equipment_locations"("id");


--
-- Name: tools tools_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tools"
    ADD CONSTRAINT "tools_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."equipment_products"("id");


--
-- Name: treatment_courses treatment_courses_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."treatment_courses"
    ADD CONSTRAINT "treatment_courses_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE RESTRICT;


--
-- Name: treatment_courses treatment_courses_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."treatment_courses"
    ADD CONSTRAINT "treatment_courses_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE RESTRICT;


--
-- Name: treatment_courses treatment_courses_treatment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."treatment_courses"
    ADD CONSTRAINT "treatment_courses_treatment_id_fkey" FOREIGN KEY ("treatment_id") REFERENCES "public"."treatments"("id") ON DELETE CASCADE;


--
-- Name: treatments treatments_animal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."treatments"
    ADD CONSTRAINT "treatments_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id");


--
-- Name: treatments treatments_disease_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."treatments"
    ADD CONSTRAINT "treatments_disease_id_fkey" FOREIGN KEY ("disease_id") REFERENCES "public"."diseases"("id");


--
-- Name: treatments treatments_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."treatments"
    ADD CONSTRAINT "treatments_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "public"."animal_visits"("id") ON DELETE SET NULL;


--
-- Name: usage_items usage_items_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."usage_items"
    ADD CONSTRAINT "usage_items_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id");


--
-- Name: usage_items usage_items_biocide_usage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."usage_items"
    ADD CONSTRAINT "usage_items_biocide_usage_id_fkey" FOREIGN KEY ("biocide_usage_id") REFERENCES "public"."biocide_usage"("id") ON DELETE SET NULL;


--
-- Name: usage_items usage_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."usage_items"
    ADD CONSTRAINT "usage_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");


--
-- Name: usage_items usage_items_treatment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."usage_items"
    ADD CONSTRAINT "usage_items_treatment_id_fkey" FOREIGN KEY ("treatment_id") REFERENCES "public"."treatments"("id") ON DELETE CASCADE;


--
-- Name: usage_items usage_items_vaccination_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."usage_items"
    ADD CONSTRAINT "usage_items_vaccination_id_fkey" FOREIGN KEY ("vaccination_id") REFERENCES "public"."vaccinations"("id") ON DELETE CASCADE;


--
-- Name: user_audit_logs user_audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_audit_logs"
    ADD CONSTRAINT "user_audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: users users_frozen_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_frozen_by_fkey" FOREIGN KEY ("frozen_by") REFERENCES "public"."users"("id");


--
-- Name: vaccinations vaccinations_animal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."vaccinations"
    ADD CONSTRAINT "vaccinations_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE CASCADE;


--
-- Name: vaccinations vaccinations_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."vaccinations"
    ADD CONSTRAINT "vaccinations_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE RESTRICT;


--
-- Name: vaccinations vaccinations_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."vaccinations"
    ADD CONSTRAINT "vaccinations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE RESTRICT;


--
-- Name: vehicle_assignments vehicle_assignments_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."vehicle_assignments"
    ADD CONSTRAINT "vehicle_assignments_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "auth"."users"("id");


--
-- Name: vehicle_assignments vehicle_assignments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."vehicle_assignments"
    ADD CONSTRAINT "vehicle_assignments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: vehicle_assignments vehicle_assignments_vehicle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."vehicle_assignments"
    ADD CONSTRAINT "vehicle_assignments_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE;


--
-- Name: vehicle_documents vehicle_documents_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."vehicle_documents"
    ADD CONSTRAINT "vehicle_documents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: vehicle_documents vehicle_documents_vehicle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."vehicle_documents"
    ADD CONSTRAINT "vehicle_documents_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE;


--
-- Name: vehicle_fuel_records vehicle_fuel_records_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."vehicle_fuel_records"
    ADD CONSTRAINT "vehicle_fuel_records_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: vehicle_fuel_records vehicle_fuel_records_vehicle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."vehicle_fuel_records"
    ADD CONSTRAINT "vehicle_fuel_records_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE;


--
-- Name: vehicle_service_visits vehicle_service_visits_completed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."vehicle_service_visits"
    ADD CONSTRAINT "vehicle_service_visits_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id");


--
-- Name: vehicle_service_visits vehicle_service_visits_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."vehicle_service_visits"
    ADD CONSTRAINT "vehicle_service_visits_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");


--
-- Name: vehicle_service_visits vehicle_service_visits_vehicle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."vehicle_service_visits"
    ADD CONSTRAINT "vehicle_service_visits_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE;


--
-- Name: vehicle_visit_parts vehicle_visit_parts_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."vehicle_visit_parts"
    ADD CONSTRAINT "vehicle_visit_parts_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id");


--
-- Name: vehicle_visit_parts vehicle_visit_parts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."vehicle_visit_parts"
    ADD CONSTRAINT "vehicle_visit_parts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");


--
-- Name: vehicle_visit_parts vehicle_visit_parts_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."vehicle_visit_parts"
    ADD CONSTRAINT "vehicle_visit_parts_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");


--
-- Name: vehicle_visit_parts vehicle_visit_parts_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."vehicle_visit_parts"
    ADD CONSTRAINT "vehicle_visit_parts_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "public"."vehicle_service_visits"("id") ON DELETE CASCADE;


--
-- Name: vehicles vehicles_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: vehicles vehicles_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: vehicles vehicles_home_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_home_location_id_fkey" FOREIGN KEY ("home_location_id") REFERENCES "public"."equipment_locations"("id");


--
-- Name: work_order_labor work_order_labor_technician_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."work_order_labor"
    ADD CONSTRAINT "work_order_labor_technician_id_fkey" FOREIGN KEY ("technician_id") REFERENCES "auth"."users"("id");


--
-- Name: work_order_labor work_order_labor_work_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."work_order_labor"
    ADD CONSTRAINT "work_order_labor_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "public"."maintenance_work_orders"("id") ON DELETE CASCADE;


--
-- Name: work_order_parts work_order_parts_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."work_order_parts"
    ADD CONSTRAINT "work_order_parts_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."equipment_batches"("id");


--
-- Name: work_order_parts work_order_parts_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."work_order_parts"
    ADD CONSTRAINT "work_order_parts_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."equipment_products"("id");


--
-- Name: work_order_parts work_order_parts_work_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."work_order_parts"
    ADD CONSTRAINT "work_order_parts_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "public"."maintenance_work_orders"("id") ON DELETE CASCADE;


--
-- Name: worker_schedules worker_schedules_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."worker_schedules"
    ADD CONSTRAINT "worker_schedules_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");


--
-- Name: worker_schedules worker_schedules_worker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."worker_schedules"
    ADD CONSTRAINT "worker_schedules_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: users Admins can delete users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can delete users" ON "public"."users" FOR DELETE USING (true);


--
-- Name: users Admins can insert users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can insert users" ON "public"."users" FOR INSERT WITH CHECK (true);


--
-- Name: users Admins can update users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can update users" ON "public"."users" FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: user_audit_logs Admins can view all audit logs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can view all audit logs" ON "public"."user_audit_logs" FOR SELECT USING (true);


--
-- Name: shared_notepad All users can delete from shared notepad; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "All users can delete from shared notepad" ON "public"."shared_notepad" FOR DELETE USING (true);


--
-- Name: shared_notepad All users can insert to shared notepad; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "All users can insert to shared notepad" ON "public"."shared_notepad" FOR INSERT WITH CHECK (true);


--
-- Name: shared_notepad All users can update shared notepad; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "All users can update shared notepad" ON "public"."shared_notepad" FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: shared_notepad All users can view shared notepad; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "All users can view shared notepad" ON "public"."shared_notepad" FOR SELECT USING (true);


--
-- Name: course_doses Allow all access to course_doses; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow all access to course_doses" ON "public"."course_doses" USING (true) WITH CHECK (true);


--
-- Name: invoices Allow all access to invoices; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow all access to invoices" ON "public"."invoices" USING (true) WITH CHECK (true);


--
-- Name: treatment_courses Allow all access to treatment_courses; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow all access to treatment_courses" ON "public"."treatment_courses" USING (true) WITH CHECK (true);


--
-- Name: vaccinations Allow all access to vaccinations; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow all access to vaccinations" ON "public"."vaccinations" USING (true) WITH CHECK (true);


--
-- Name: animal_visits Allow all deletes; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow all deletes" ON "public"."animal_visits" FOR DELETE USING (true);


--
-- Name: teat_status Allow all deletes; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow all deletes" ON "public"."teat_status" FOR DELETE USING (true);


--
-- Name: animal_visits Allow all inserts; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow all inserts" ON "public"."animal_visits" FOR INSERT WITH CHECK (true);


--
-- Name: teat_status Allow all inserts; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow all inserts" ON "public"."teat_status" FOR INSERT WITH CHECK (true);


--
-- Name: cost_centers Allow all operations on cost_centers; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow all operations on cost_centers" ON "public"."cost_centers" USING (true) WITH CHECK (true);


--
-- Name: equipment_batches Allow all operations on equipment_batches; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow all operations on equipment_batches" ON "public"."equipment_batches" USING (true) WITH CHECK (true);


--
-- Name: equipment_categories Allow all operations on equipment_categories; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow all operations on equipment_categories" ON "public"."equipment_categories" USING (true) WITH CHECK (true);


--
-- Name: equipment_invoice_item_assignments Allow all operations on equipment_invoice_item_assignments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow all operations on equipment_invoice_item_assignments" ON "public"."equipment_invoice_item_assignments" USING (true) WITH CHECK (true);


--
-- Name: equipment_invoice_items Allow all operations on equipment_invoice_items; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow all operations on equipment_invoice_items" ON "public"."equipment_invoice_items" USING (true) WITH CHECK (true);


--
-- Name: equipment_invoices Allow all operations on equipment_invoices; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow all operations on equipment_invoices" ON "public"."equipment_invoices" USING (true) WITH CHECK (true);


--
-- Name: equipment_issuance_items Allow all operations on equipment_issuance_items; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow all operations on equipment_issuance_items" ON "public"."equipment_issuance_items" USING (true) WITH CHECK (true);


--
-- Name: equipment_issuances Allow all operations on equipment_issuances; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow all operations on equipment_issuances" ON "public"."equipment_issuances" USING (true) WITH CHECK (true);


--
-- Name: equipment_locations Allow all operations on equipment_locations; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow all operations on equipment_locations" ON "public"."equipment_locations" USING (true) WITH CHECK (true);


--
-- Name: equipment_products Allow all operations on equipment_products; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow all operations on equipment_products" ON "public"."equipment_products" USING (true) WITH CHECK (true);


--
-- Name: equipment_suppliers Allow all operations on equipment_suppliers; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow all operations on equipment_suppliers" ON "public"."equipment_suppliers" USING (true) WITH CHECK (true);


--
-- Name: invoice_items Allow all operations on invoice_items; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow all operations on invoice_items" ON "public"."invoice_items" USING (true) WITH CHECK (true);


--
-- Name: invoices Allow all operations on invoices; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow all operations on invoices" ON "public"."invoices" USING (true) WITH CHECK (true);


--
-- Name: maintenance_schedules Allow all operations on maintenance_schedules; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow all operations on maintenance_schedules" ON "public"."maintenance_schedules" USING (true) WITH CHECK (true);


--
-- Name: maintenance_work_orders Allow all operations on maintenance_work_orders; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow all operations on maintenance_work_orders" ON "public"."maintenance_work_orders" USING (true) WITH CHECK (true);


--
-- Name: ppe_issuance_records Allow all operations on ppe_issuance_records; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow all operations on ppe_issuance_records" ON "public"."ppe_issuance_records" USING (true) WITH CHECK (true);


--
-- Name: ppe_items Allow all operations on ppe_items; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow all operations on ppe_items" ON "public"."ppe_items" USING (true) WITH CHECK (true);


--
-- Name: product_quality_reviews Allow all operations on product_quality_reviews; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow all operations on product_quality_reviews" ON "public"."product_quality_reviews" USING (true) WITH CHECK (true);


--
-- Name: product_quality_schedules Allow all operations on product_quality_schedules; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow all operations on product_quality_schedules" ON "public"."product_quality_schedules" USING (true) WITH CHECK (true);


--
-- Name: tool_movements Allow all operations on tool_movements; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow all operations on tool_movements" ON "public"."tool_movements" USING (true) WITH CHECK (true);


--
-- Name: tools Allow all operations on tools; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow all operations on tools" ON "public"."tools" USING (true) WITH CHECK (true);


--
-- Name: vehicle_assignments Allow all operations on vehicle_assignments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow all operations on vehicle_assignments" ON "public"."vehicle_assignments" USING (true) WITH CHECK (true);


--
-- Name: vehicle_documents Allow all operations on vehicle_documents; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow all operations on vehicle_documents" ON "public"."vehicle_documents" USING (true) WITH CHECK (true);


--
-- Name: vehicle_fuel_records Allow all operations on vehicle_fuel_records; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow all operations on vehicle_fuel_records" ON "public"."vehicle_fuel_records" USING (true) WITH CHECK (true);


--
-- Name: vehicles Allow all operations on vehicles; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow all operations on vehicles" ON "public"."vehicles" USING (true) WITH CHECK (true);


--
-- Name: work_order_labor Allow all operations on work_order_labor; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow all operations on work_order_labor" ON "public"."work_order_labor" USING (true) WITH CHECK (true);


--
-- Name: work_order_parts Allow all operations on work_order_parts; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow all operations on work_order_parts" ON "public"."work_order_parts" USING (true) WITH CHECK (true);


--
-- Name: animal_visits Allow all reads; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow all reads" ON "public"."animal_visits" FOR SELECT USING (true);


--
-- Name: teat_status Allow all reads; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow all reads" ON "public"."teat_status" FOR SELECT USING (true);


--
-- Name: animal_visits Allow all updates; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow all updates" ON "public"."animal_visits" FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: teat_status Allow all updates; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow all updates" ON "public"."teat_status" FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: milk_weights Anyone can insert milk weights; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Anyone can insert milk weights" ON "public"."milk_weights" FOR INSERT WITH CHECK (true);


--
-- Name: hoof_condition_codes Anyone can view condition codes; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Anyone can view condition codes" ON "public"."hoof_condition_codes" FOR SELECT TO "authenticated" USING (true);


--
-- Name: milk_weights Anyone can view milk weights; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Anyone can view milk weights" ON "public"."milk_weights" FOR SELECT USING (true);


--
-- Name: milk_composition_tests Authenticated users can delete composition tests; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can delete composition tests" ON "public"."milk_composition_tests" FOR DELETE TO "authenticated" USING (true);


--
-- Name: milk_production Authenticated users can delete milk production records; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can delete milk production records" ON "public"."milk_production" FOR DELETE TO "authenticated" USING (true);


--
-- Name: milk_tests Authenticated users can delete milk test records; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can delete milk test records" ON "public"."milk_tests" FOR DELETE TO "authenticated" USING (true);


--
-- Name: milk_weights Authenticated users can delete milk weights; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can delete milk weights" ON "public"."milk_weights" FOR DELETE TO "authenticated" USING (true);


--
-- Name: milk_quality_tests Authenticated users can delete quality tests; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can delete quality tests" ON "public"."milk_quality_tests" FOR DELETE TO "authenticated" USING (true);


--
-- Name: milk_composition_tests Authenticated users can insert composition tests; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can insert composition tests" ON "public"."milk_composition_tests" FOR INSERT TO "authenticated" WITH CHECK (true);


--
-- Name: milk_production Authenticated users can insert milk production records; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can insert milk production records" ON "public"."milk_production" FOR INSERT TO "authenticated" WITH CHECK (true);


--
-- Name: milk_tests Authenticated users can insert milk test records; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can insert milk test records" ON "public"."milk_tests" FOR INSERT TO "authenticated" WITH CHECK (true);


--
-- Name: milk_producers Authenticated users can insert producers; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can insert producers" ON "public"."milk_producers" FOR INSERT TO "authenticated" WITH CHECK (true);


--
-- Name: milk_quality_tests Authenticated users can insert quality tests; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can insert quality tests" ON "public"."milk_quality_tests" FOR INSERT TO "authenticated" WITH CHECK (true);


--
-- Name: milk_scrape_sessions Authenticated users can insert scrape sessions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can insert scrape sessions" ON "public"."milk_scrape_sessions" FOR INSERT TO "authenticated" WITH CHECK (true);


--
-- Name: milk_test_summaries Authenticated users can insert summaries; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can insert summaries" ON "public"."milk_test_summaries" FOR INSERT TO "authenticated" WITH CHECK (true);


--
-- Name: milk_composition_tests Authenticated users can update composition tests; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can update composition tests" ON "public"."milk_composition_tests" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);


--
-- Name: milk_production Authenticated users can update milk production records; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can update milk production records" ON "public"."milk_production" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);


--
-- Name: milk_tests Authenticated users can update milk test records; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can update milk test records" ON "public"."milk_tests" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);


--
-- Name: milk_weights Authenticated users can update milk weights; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can update milk weights" ON "public"."milk_weights" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);


--
-- Name: milk_producers Authenticated users can update producers; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can update producers" ON "public"."milk_producers" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);


--
-- Name: milk_quality_tests Authenticated users can update quality tests; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can update quality tests" ON "public"."milk_quality_tests" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);


--
-- Name: system_settings Authenticated users can update settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can update settings" ON "public"."system_settings" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);


--
-- Name: milk_production Authenticated users can view all milk production records; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can view all milk production records" ON "public"."milk_production" FOR SELECT TO "authenticated" USING (true);


--
-- Name: milk_tests Authenticated users can view all milk test records; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can view all milk test records" ON "public"."milk_tests" FOR SELECT TO "authenticated" USING (true);


--
-- Name: batch_waste_tracking Authenticated users can view batch waste tracking; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can view batch waste tracking" ON "public"."batch_waste_tracking" FOR SELECT TO "authenticated" USING (true);


--
-- Name: milk_composition_tests Authenticated users can view composition tests; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can view composition tests" ON "public"."milk_composition_tests" FOR SELECT TO "authenticated" USING (true);


--
-- Name: milk_producers Authenticated users can view producers; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can view producers" ON "public"."milk_producers" FOR SELECT TO "authenticated" USING (true);


--
-- Name: milk_quality_tests Authenticated users can view quality tests; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can view quality tests" ON "public"."milk_quality_tests" FOR SELECT TO "authenticated" USING (true);


--
-- Name: milk_scrape_sessions Authenticated users can view scrape sessions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can view scrape sessions" ON "public"."milk_scrape_sessions" FOR SELECT TO "authenticated" USING (true);


--
-- Name: system_settings Authenticated users can view settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can view settings" ON "public"."system_settings" FOR SELECT TO "authenticated" USING (true);


--
-- Name: milk_test_summaries Authenticated users can view summaries; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can view summaries" ON "public"."milk_test_summaries" FOR SELECT TO "authenticated" USING (true);


--
-- Name: farm_equipment Enable all for authenticated users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable all for authenticated users" ON "public"."farm_equipment" TO "authenticated" USING (true) WITH CHECK (true);


--
-- Name: farm_equipment_items Enable all for authenticated users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable all for authenticated users" ON "public"."farm_equipment_items" TO "authenticated" USING (true) WITH CHECK (true);


--
-- Name: farm_equipment_service_records Enable all for authenticated users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable all for authenticated users" ON "public"."farm_equipment_service_records" TO "authenticated" USING (true) WITH CHECK (true);


--
-- Name: user_audit_logs System can insert audit logs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "System can insert audit logs" ON "public"."user_audit_logs" FOR INSERT WITH CHECK (true);


--
-- Name: batch_waste_tracking System can insert batch waste tracking; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "System can insert batch waste tracking" ON "public"."batch_waste_tracking" FOR INSERT TO "authenticated" WITH CHECK (true);


--
-- Name: equipment_stock_movements Users can create equipment stock movements; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can create equipment stock movements" ON "public"."equipment_stock_movements" FOR INSERT TO "authenticated" WITH CHECK (true);


--
-- Name: hoof_records Users can create hoof records; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can create hoof records" ON "public"."hoof_records" FOR INSERT TO "authenticated" WITH CHECK (true);


--
-- Name: course_medication_schedules Users can create medication schedules; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can create medication schedules" ON "public"."course_medication_schedules" FOR INSERT TO "authenticated" WITH CHECK (true);


--
-- Name: vehicle_documents Users can create vehicle documents; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can create vehicle documents" ON "public"."vehicle_documents" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."vehicles"
  WHERE ("vehicles"."id" = "vehicle_documents"."vehicle_id"))));


--
-- Name: hoof_records Users can delete hoof records; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete hoof records" ON "public"."hoof_records" FOR DELETE TO "authenticated" USING (true);


--
-- Name: insemination_inventory Users can delete insemination inventory; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete insemination inventory" ON "public"."insemination_inventory" FOR DELETE USING (true);


--
-- Name: insemination_products Users can delete insemination products; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete insemination products" ON "public"."insemination_products" FOR DELETE USING (true);


--
-- Name: insemination_records Users can delete insemination records; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete insemination records" ON "public"."insemination_records" FOR DELETE USING (true);


--
-- Name: course_medication_schedules Users can delete medication schedules; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete medication schedules" ON "public"."course_medication_schedules" FOR DELETE TO "authenticated" USING (true);


--
-- Name: synchronization_protocols Users can delete protocols; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete protocols" ON "public"."synchronization_protocols" FOR DELETE USING (true);


--
-- Name: synchronization_steps Users can delete steps; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete steps" ON "public"."synchronization_steps" FOR DELETE USING (true);


--
-- Name: animal_synchronizations Users can delete synchronizations; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete synchronizations" ON "public"."animal_synchronizations" FOR DELETE USING (true);


--
-- Name: vehicle_documents Users can delete vehicle documents; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete vehicle documents" ON "public"."vehicle_documents" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."vehicles"
  WHERE ("vehicles"."id" = "vehicle_documents"."vehicle_id"))));


--
-- Name: milk_composition_tests Users can insert composition tests; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert composition tests" ON "public"."milk_composition_tests" FOR INSERT TO "authenticated" WITH CHECK (true);


--
-- Name: insemination_inventory Users can insert insemination inventory; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert insemination inventory" ON "public"."insemination_inventory" FOR INSERT WITH CHECK (true);


--
-- Name: insemination_products Users can insert insemination products; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert insemination products" ON "public"."insemination_products" FOR INSERT WITH CHECK (true);


--
-- Name: insemination_records Users can insert insemination records; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert insemination records" ON "public"."insemination_records" FOR INSERT WITH CHECK (true);


--
-- Name: milk_producers Users can insert milk producers; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert milk producers" ON "public"."milk_producers" FOR INSERT TO "authenticated" WITH CHECK (true);


--
-- Name: synchronization_protocols Users can insert protocols; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert protocols" ON "public"."synchronization_protocols" FOR INSERT WITH CHECK (true);


--
-- Name: milk_quality_tests Users can insert quality tests; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert quality tests" ON "public"."milk_quality_tests" FOR INSERT TO "authenticated" WITH CHECK (true);


--
-- Name: synchronization_steps Users can insert steps; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert steps" ON "public"."synchronization_steps" FOR INSERT WITH CHECK (true);


--
-- Name: animal_synchronizations Users can insert synchronizations; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert synchronizations" ON "public"."animal_synchronizations" FOR INSERT WITH CHECK (true);


--
-- Name: hoof_condition_codes Users can manage condition codes; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage condition codes" ON "public"."hoof_condition_codes" TO "authenticated" USING (true) WITH CHECK (true);


--
-- Name: users Users can read own data; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can read own data" ON "public"."users" FOR SELECT USING (true);


--
-- Name: synchronization_protocols Users can read protocols; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can read protocols" ON "public"."synchronization_protocols" FOR SELECT USING (true);


--
-- Name: synchronization_steps Users can read steps; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can read steps" ON "public"."synchronization_steps" FOR SELECT USING (true);


--
-- Name: animal_synchronizations Users can read synchronizations; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can read synchronizations" ON "public"."animal_synchronizations" FOR SELECT USING (true);


--
-- Name: milk_composition_tests Users can update composition tests; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update composition tests" ON "public"."milk_composition_tests" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);


--
-- Name: hoof_records Users can update hoof records; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update hoof records" ON "public"."hoof_records" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);


--
-- Name: insemination_inventory Users can update insemination inventory; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update insemination inventory" ON "public"."insemination_inventory" FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: insemination_products Users can update insemination products; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update insemination products" ON "public"."insemination_products" FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: insemination_records Users can update insemination records; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update insemination records" ON "public"."insemination_records" FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: course_medication_schedules Users can update medication schedules; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update medication schedules" ON "public"."course_medication_schedules" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);


--
-- Name: milk_producers Users can update milk producers; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update milk producers" ON "public"."milk_producers" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);


--
-- Name: synchronization_protocols Users can update protocols; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update protocols" ON "public"."synchronization_protocols" FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: milk_quality_tests Users can update quality tests; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update quality tests" ON "public"."milk_quality_tests" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);


--
-- Name: synchronization_steps Users can update steps; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update steps" ON "public"."synchronization_steps" FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: animal_synchronizations Users can update synchronizations; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update synchronizations" ON "public"."animal_synchronizations" FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: vehicle_documents Users can update vehicle documents; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update vehicle documents" ON "public"."vehicle_documents" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."vehicles"
  WHERE ("vehicles"."id" = "vehicle_documents"."vehicle_id")))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."vehicles"
  WHERE ("vehicles"."id" = "vehicle_documents"."vehicle_id"))));


--
-- Name: milk_composition_tests Users can view composition tests; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view composition tests" ON "public"."milk_composition_tests" FOR SELECT TO "authenticated" USING (true);


--
-- Name: equipment_stock_movements Users can view equipment stock movements; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view equipment stock movements" ON "public"."equipment_stock_movements" FOR SELECT TO "authenticated" USING (true);


--
-- Name: hoof_records Users can view hoof records; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view hoof records" ON "public"."hoof_records" FOR SELECT TO "authenticated" USING (true);


--
-- Name: insemination_inventory Users can view insemination inventory; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view insemination inventory" ON "public"."insemination_inventory" FOR SELECT USING (true);


--
-- Name: insemination_products Users can view insemination products; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view insemination products" ON "public"."insemination_products" FOR SELECT USING (true);


--
-- Name: insemination_records Users can view insemination records; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view insemination records" ON "public"."insemination_records" FOR SELECT USING (true);


--
-- Name: course_medication_schedules Users can view medication schedules; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view medication schedules" ON "public"."course_medication_schedules" FOR SELECT TO "authenticated" USING (true);


--
-- Name: milk_producers Users can view milk producers; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view milk producers" ON "public"."milk_producers" FOR SELECT TO "authenticated" USING (true);


--
-- Name: milk_quality_tests Users can view quality tests; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view quality tests" ON "public"."milk_quality_tests" FOR SELECT TO "authenticated" USING (true);


--
-- Name: vehicle_service_visits Users can view service visits for their vehicles; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view service visits for their vehicles" ON "public"."vehicle_service_visits" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."vehicles"
  WHERE ("vehicles"."id" = "vehicle_service_visits"."vehicle_id"))));


--
-- Name: vehicle_documents Users can view vehicle documents; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view vehicle documents" ON "public"."vehicle_documents" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."vehicles"
  WHERE ("vehicles"."id" = "vehicle_documents"."vehicle_id"))));


--
-- Name: animal_synchronizations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."animal_synchronizations" ENABLE ROW LEVEL SECURITY;

--
-- Name: animal_visits; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."animal_visits" ENABLE ROW LEVEL SECURITY;

--
-- Name: batch_waste_tracking; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."batch_waste_tracking" ENABLE ROW LEVEL SECURITY;

--
-- Name: cost_centers; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."cost_centers" ENABLE ROW LEVEL SECURITY;

--
-- Name: course_doses; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."course_doses" ENABLE ROW LEVEL SECURITY;

--
-- Name: course_medication_schedules; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."course_medication_schedules" ENABLE ROW LEVEL SECURITY;

--
-- Name: equipment_batches; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."equipment_batches" ENABLE ROW LEVEL SECURITY;

--
-- Name: equipment_categories; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."equipment_categories" ENABLE ROW LEVEL SECURITY;

--
-- Name: equipment_invoice_item_assignments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."equipment_invoice_item_assignments" ENABLE ROW LEVEL SECURITY;

--
-- Name: equipment_invoice_items; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."equipment_invoice_items" ENABLE ROW LEVEL SECURITY;

--
-- Name: equipment_invoices; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."equipment_invoices" ENABLE ROW LEVEL SECURITY;

--
-- Name: equipment_issuance_items; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."equipment_issuance_items" ENABLE ROW LEVEL SECURITY;

--
-- Name: equipment_issuances; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."equipment_issuances" ENABLE ROW LEVEL SECURITY;

--
-- Name: equipment_locations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."equipment_locations" ENABLE ROW LEVEL SECURITY;

--
-- Name: equipment_products; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."equipment_products" ENABLE ROW LEVEL SECURITY;

--
-- Name: equipment_stock_movements; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."equipment_stock_movements" ENABLE ROW LEVEL SECURITY;

--
-- Name: equipment_suppliers; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."equipment_suppliers" ENABLE ROW LEVEL SECURITY;

--
-- Name: fire_extinguishers; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."fire_extinguishers" ENABLE ROW LEVEL SECURITY;

--
-- Name: fire_extinguishers fire_extinguishers_delete_policy; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "fire_extinguishers_delete_policy" ON "public"."fire_extinguishers" FOR DELETE USING (true);


--
-- Name: fire_extinguishers fire_extinguishers_insert_policy; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "fire_extinguishers_insert_policy" ON "public"."fire_extinguishers" FOR INSERT WITH CHECK (true);


--
-- Name: fire_extinguishers fire_extinguishers_select_policy; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "fire_extinguishers_select_policy" ON "public"."fire_extinguishers" FOR SELECT USING (true);


--
-- Name: fire_extinguishers fire_extinguishers_update_policy; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "fire_extinguishers_update_policy" ON "public"."fire_extinguishers" FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: hoof_condition_codes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."hoof_condition_codes" ENABLE ROW LEVEL SECURITY;

--
-- Name: hoof_records; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."hoof_records" ENABLE ROW LEVEL SECURITY;

--
-- Name: insemination_inventory; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."insemination_inventory" ENABLE ROW LEVEL SECURITY;

--
-- Name: insemination_products; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."insemination_products" ENABLE ROW LEVEL SECURITY;

--
-- Name: insemination_records; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."insemination_records" ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_items; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."invoice_items" ENABLE ROW LEVEL SECURITY;

--
-- Name: invoices; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;

--
-- Name: maintenance_schedules; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."maintenance_schedules" ENABLE ROW LEVEL SECURITY;

--
-- Name: maintenance_work_orders; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."maintenance_work_orders" ENABLE ROW LEVEL SECURITY;

--
-- Name: milk_weights; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."milk_weights" ENABLE ROW LEVEL SECURITY;

--
-- Name: ppe_issuance_records; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."ppe_issuance_records" ENABLE ROW LEVEL SECURITY;

--
-- Name: ppe_items; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."ppe_items" ENABLE ROW LEVEL SECURITY;

--
-- Name: product_quality_reviews; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."product_quality_reviews" ENABLE ROW LEVEL SECURITY;

--
-- Name: product_quality_schedules; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."product_quality_schedules" ENABLE ROW LEVEL SECURITY;

--
-- Name: shared_notepad; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."shared_notepad" ENABLE ROW LEVEL SECURITY;

--
-- Name: synchronization_protocols; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."synchronization_protocols" ENABLE ROW LEVEL SECURITY;

--
-- Name: synchronization_steps; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."synchronization_steps" ENABLE ROW LEVEL SECURITY;

--
-- Name: system_settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."system_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: teat_status; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."teat_status" ENABLE ROW LEVEL SECURITY;

--
-- Name: tool_movements; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."tool_movements" ENABLE ROW LEVEL SECURITY;

--
-- Name: tools; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."tools" ENABLE ROW LEVEL SECURITY;

--
-- Name: treatment_courses; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."treatment_courses" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_audit_logs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."user_audit_logs" ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;

--
-- Name: vaccinations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."vaccinations" ENABLE ROW LEVEL SECURITY;

--
-- Name: vehicle_assignments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."vehicle_assignments" ENABLE ROW LEVEL SECURITY;

--
-- Name: vehicle_documents; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."vehicle_documents" ENABLE ROW LEVEL SECURITY;

--
-- Name: vehicle_fuel_records; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."vehicle_fuel_records" ENABLE ROW LEVEL SECURITY;

--
-- Name: vehicles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."vehicles" ENABLE ROW LEVEL SECURITY;

--
-- Name: work_order_labor; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."work_order_labor" ENABLE ROW LEVEL SECURITY;

--
-- Name: work_order_parts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."work_order_parts" ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA "public"; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


--
-- Name: FUNCTION "auto_generate_medical_waste"("p_batch_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."auto_generate_medical_waste"("p_batch_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."auto_generate_medical_waste"("p_batch_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_generate_medical_waste"("p_batch_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "auto_link_milk_test_to_weight"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."auto_link_milk_test_to_weight"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_link_milk_test_to_weight"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_link_milk_test_to_weight"() TO "service_role";


--
-- Name: FUNCTION "auto_split_usage_items"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."auto_split_usage_items"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_split_usage_items"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_split_usage_items"() TO "service_role";


--
-- Name: FUNCTION "calculate_average_daily_milk"("p_animal_id" "uuid", "p_before_date" "date"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."calculate_average_daily_milk"("p_animal_id" "uuid", "p_before_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_average_daily_milk"("p_animal_id" "uuid", "p_before_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_average_daily_milk"("p_animal_id" "uuid", "p_before_date" "date") TO "service_role";


--
-- Name: FUNCTION "calculate_milk_loss_for_synchronization"("p_animal_id" "uuid", "p_sync_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."calculate_milk_loss_for_synchronization"("p_animal_id" "uuid", "p_sync_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_milk_loss_for_synchronization"("p_animal_id" "uuid", "p_sync_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_milk_loss_for_synchronization"("p_animal_id" "uuid", "p_sync_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "calculate_next_service_date"("p_last_service_date" "date", "p_interval_value" integer, "p_interval_type" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."calculate_next_service_date"("p_last_service_date" "date", "p_interval_value" integer, "p_interval_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_next_service_date"("p_last_service_date" "date", "p_interval_value" integer, "p_interval_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_next_service_date"("p_last_service_date" "date", "p_interval_value" integer, "p_interval_type" "text") TO "service_role";


--
-- Name: FUNCTION "calculate_received_qty"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."calculate_received_qty"() TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_received_qty"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_received_qty"() TO "service_role";


--
-- Name: FUNCTION "calculate_treatment_milk_loss"("p_treatment_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."calculate_treatment_milk_loss"("p_treatment_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_treatment_milk_loss"("p_treatment_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_treatment_milk_loss"("p_treatment_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "calculate_withdrawal_dates"("p_treatment_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."calculate_withdrawal_dates"("p_treatment_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_withdrawal_dates"("p_treatment_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_withdrawal_dates"("p_treatment_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "cancel_animal_synchronization_protocols"("p_animal_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."cancel_animal_synchronization_protocols"("p_animal_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_animal_synchronization_protocols"("p_animal_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_animal_synchronization_protocols"("p_animal_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "check_batch_depletion"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."check_batch_depletion"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_batch_depletion"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_batch_depletion"() TO "service_role";


--
-- Name: FUNCTION "check_batch_stock"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."check_batch_stock"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_batch_stock"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_batch_stock"() TO "service_role";


--
-- Name: FUNCTION "check_course_completion"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."check_course_completion"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_course_completion"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_course_completion"() TO "service_role";


--
-- Name: FUNCTION "complete_synchronization_step"("p_step_id" "uuid", "p_batch_id" "uuid", "p_actual_dosage" numeric, "p_actual_unit" "text", "p_notes" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."complete_synchronization_step"("p_step_id" "uuid", "p_batch_id" "uuid", "p_actual_dosage" numeric, "p_actual_unit" "text", "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."complete_synchronization_step"("p_step_id" "uuid", "p_batch_id" "uuid", "p_actual_dosage" numeric, "p_actual_unit" "text", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_synchronization_step"("p_step_id" "uuid", "p_batch_id" "uuid", "p_actual_dosage" numeric, "p_actual_unit" "text", "p_notes" "text") TO "service_role";


--
-- Name: FUNCTION "course_has_flexible_schedule"("p_course_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."course_has_flexible_schedule"("p_course_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."course_has_flexible_schedule"("p_course_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."course_has_flexible_schedule"("p_course_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "create_course_doses"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."create_course_doses"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_course_doses"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_course_doses"() TO "service_role";


--
-- Name: FUNCTION "create_usage_item_from_vaccination"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."create_usage_item_from_vaccination"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_usage_item_from_vaccination"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_usage_item_from_vaccination"() TO "service_role";


--
-- Name: FUNCTION "create_user"("p_email" "text", "p_password" "text", "p_role" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."create_user"("p_email" "text", "p_password" "text", "p_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_user"("p_email" "text", "p_password" "text", "p_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_user"("p_email" "text", "p_password" "text", "p_role" "text") TO "service_role";


--
-- Name: FUNCTION "deactivate_missing_animals"("_current_tag_nos" "text"[]); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."deactivate_missing_animals"("_current_tag_nos" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."deactivate_missing_animals"("_current_tag_nos" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."deactivate_missing_animals"("_current_tag_nos" "text"[]) TO "service_role";


--
-- Name: FUNCTION "deduct_equipment_stock"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."deduct_equipment_stock"() TO "anon";
GRANT ALL ON FUNCTION "public"."deduct_equipment_stock"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."deduct_equipment_stock"() TO "service_role";


--
-- Name: FUNCTION "deduct_farm_equipment_service_stock"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."deduct_farm_equipment_service_stock"() TO "anon";
GRANT ALL ON FUNCTION "public"."deduct_farm_equipment_service_stock"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."deduct_farm_equipment_service_stock"() TO "service_role";


--
-- Name: FUNCTION "deduct_sync_step_medication"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."deduct_sync_step_medication"() TO "anon";
GRANT ALL ON FUNCTION "public"."deduct_sync_step_medication"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."deduct_sync_step_medication"() TO "service_role";


--
-- Name: FUNCTION "deduct_work_order_parts"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."deduct_work_order_parts"() TO "anon";
GRANT ALL ON FUNCTION "public"."deduct_work_order_parts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."deduct_work_order_parts"() TO "service_role";


--
-- Name: FUNCTION "determine_session_type"("measurement_time" timestamp with time zone, "tz" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."determine_session_type"("measurement_time" timestamp with time zone, "tz" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."determine_session_type"("measurement_time" timestamp with time zone, "tz" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."determine_session_type"("measurement_time" timestamp with time zone, "tz" "text") TO "service_role";


--
-- Name: FUNCTION "fn_check_usage_constraints"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."fn_check_usage_constraints"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_check_usage_constraints"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_check_usage_constraints"() TO "service_role";


--
-- Name: FUNCTION "fn_fifo_batch"("p_product_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."fn_fifo_batch"("p_product_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_fifo_batch"("p_product_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_fifo_batch"("p_product_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "freeze_user"("p_user_id" "uuid", "p_admin_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."freeze_user"("p_user_id" "uuid", "p_admin_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."freeze_user"("p_user_id" "uuid", "p_admin_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."freeze_user"("p_user_id" "uuid", "p_admin_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "gea_daily_upload"("payload" "jsonb"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."gea_daily_upload"("payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."gea_daily_upload"("payload" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."gea_daily_upload"("payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gea_daily_upload"("payload" "jsonb") TO "service_role";


--
-- Name: FUNCTION "generate_equipment_issuance_number"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."generate_equipment_issuance_number"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_equipment_issuance_number"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_equipment_issuance_number"() TO "service_role";


--
-- Name: FUNCTION "generate_work_order_number"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."generate_work_order_number"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_work_order_number"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_work_order_number"() TO "service_role";


--
-- Name: FUNCTION "get_animal_avg_milk_at_date"("p_animal_id" "uuid", "p_date" "date"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_animal_avg_milk_at_date"("p_animal_id" "uuid", "p_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_animal_avg_milk_at_date"("p_animal_id" "uuid", "p_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_animal_avg_milk_at_date"("p_animal_id" "uuid", "p_date" "date") TO "service_role";


--
-- Name: FUNCTION "get_course_progress"("p_course_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_course_progress"("p_course_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_course_progress"("p_course_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_course_progress"("p_course_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "get_scheduled_medications_for_visit"("p_course_id" "uuid", "p_visit_date" "date"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_scheduled_medications_for_visit"("p_course_id" "uuid", "p_visit_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_scheduled_medications_for_visit"("p_course_id" "uuid", "p_visit_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_scheduled_medications_for_visit"("p_course_id" "uuid", "p_visit_date" "date") TO "service_role";


--
-- Name: FUNCTION "get_setting"("key" "text", "default_value" numeric); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_setting"("key" "text", "default_value" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."get_setting"("key" "text", "default_value" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_setting"("key" "text", "default_value" numeric) TO "service_role";


--
-- Name: FUNCTION "get_user_audit_logs"("p_user_id" "uuid", "p_limit" integer, "p_offset" integer); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_user_audit_logs"("p_user_id" "uuid", "p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_audit_logs"("p_user_id" "uuid", "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_audit_logs"("p_user_id" "uuid", "p_limit" integer, "p_offset" integer) TO "service_role";


--
-- Name: FUNCTION "get_user_role"("user_uuid" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_user_role"("user_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_role"("user_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_role"("user_uuid" "uuid") TO "service_role";


--
-- Name: FUNCTION "handle_new_user"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";


--
-- Name: FUNCTION "handle_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "service_role";


--
-- Name: FUNCTION "handle_vehicle_visit_part_stock"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."handle_vehicle_visit_part_stock"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_vehicle_visit_part_stock"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_vehicle_visit_part_stock"() TO "service_role";


--
-- Name: FUNCTION "import_milk_data"("p_scraped_data" "jsonb"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."import_milk_data"("p_scraped_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."import_milk_data"("p_scraped_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."import_milk_data"("p_scraped_data" "jsonb") TO "service_role";


--
-- Name: FUNCTION "initialize_animal_synchronization"("p_animal_id" "uuid", "p_protocol_id" "uuid", "p_start_date" "date"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."initialize_animal_synchronization"("p_animal_id" "uuid", "p_protocol_id" "uuid", "p_start_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."initialize_animal_synchronization"("p_animal_id" "uuid", "p_protocol_id" "uuid", "p_start_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."initialize_animal_synchronization"("p_animal_id" "uuid", "p_protocol_id" "uuid", "p_start_date" "date") TO "service_role";


--
-- Name: FUNCTION "initialize_batch_fields"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."initialize_batch_fields"() TO "anon";
GRANT ALL ON FUNCTION "public"."initialize_batch_fields"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."initialize_batch_fields"() TO "service_role";


--
-- Name: FUNCTION "is_admin"("user_uuid" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."is_admin"("user_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"("user_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"("user_uuid" "uuid") TO "service_role";


--
-- Name: FUNCTION "is_user_frozen"("p_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."is_user_frozen"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_user_frozen"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_user_frozen"("p_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "link_medications_to_visit"("p_course_id" "uuid", "p_visit_id" "uuid", "p_visit_date" "date"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."link_medications_to_visit"("p_course_id" "uuid", "p_visit_id" "uuid", "p_visit_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."link_medications_to_visit"("p_course_id" "uuid", "p_visit_id" "uuid", "p_visit_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."link_medications_to_visit"("p_course_id" "uuid", "p_visit_id" "uuid", "p_visit_date" "date") TO "service_role";


--
-- Name: FUNCTION "link_past_milk_tests_to_weights"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."link_past_milk_tests_to_weights"() TO "anon";
GRANT ALL ON FUNCTION "public"."link_past_milk_tests_to_weights"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."link_past_milk_tests_to_weights"() TO "service_role";


--
-- Name: FUNCTION "log_user_action"("p_user_id" "uuid", "p_action" "text", "p_table_name" "text", "p_record_id" "uuid", "p_old_data" "jsonb", "p_new_data" "jsonb", "p_ip_address" "text", "p_user_agent" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."log_user_action"("p_user_id" "uuid", "p_action" "text", "p_table_name" "text", "p_record_id" "uuid", "p_old_data" "jsonb", "p_new_data" "jsonb", "p_ip_address" "text", "p_user_agent" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."log_user_action"("p_user_id" "uuid", "p_action" "text", "p_table_name" "text", "p_record_id" "uuid", "p_old_data" "jsonb", "p_new_data" "jsonb", "p_ip_address" "text", "p_user_agent" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_user_action"("p_user_id" "uuid", "p_action" "text", "p_table_name" "text", "p_record_id" "uuid", "p_old_data" "jsonb", "p_new_data" "jsonb", "p_ip_address" "text", "p_user_agent" "text") TO "service_role";


--
-- Name: FUNCTION "lookup_bom"("comp" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."lookup_bom"("comp" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."lookup_bom"("comp" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."lookup_bom"("comp" "text") TO "service_role";


--
-- Name: FUNCTION "on_gea_daily_status_change"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."on_gea_daily_status_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."on_gea_daily_status_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."on_gea_daily_status_change"() TO "service_role";


--
-- Name: FUNCTION "parse_milk_date"("date_str" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."parse_milk_date"("date_str" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."parse_milk_date"("date_str" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."parse_milk_date"("date_str" "text") TO "service_role";


--
-- Name: FUNCTION "process_visit_medications"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."process_visit_medications"() TO "anon";
GRANT ALL ON FUNCTION "public"."process_visit_medications"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_visit_medications"() TO "service_role";


--
-- Name: FUNCTION "reset_planned_medication_quantities"("p_visit_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."reset_planned_medication_quantities"("p_visit_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."reset_planned_medication_quantities"("p_visit_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reset_planned_medication_quantities"("p_visit_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "restore_equipment_stock"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."restore_equipment_stock"() TO "anon";
GRANT ALL ON FUNCTION "public"."restore_equipment_stock"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."restore_equipment_stock"() TO "service_role";


--
-- Name: FUNCTION "restore_vehicle_visit_part_stock"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."restore_vehicle_visit_part_stock"() TO "anon";
GRANT ALL ON FUNCTION "public"."restore_vehicle_visit_part_stock"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."restore_vehicle_visit_part_stock"() TO "service_role";


--
-- Name: FUNCTION "safe_bool_lt"("p" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."safe_bool_lt"("p" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."safe_bool_lt"("p" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."safe_bool_lt"("p" "text") TO "service_role";


--
-- Name: FUNCTION "safe_date"("p" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."safe_date"("p" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."safe_date"("p" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."safe_date"("p" "text") TO "service_role";


--
-- Name: FUNCTION "safe_int"("p" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."safe_int"("p" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."safe_int"("p" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."safe_int"("p" "text") TO "service_role";


--
-- Name: FUNCTION "safe_numeric"("p" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."safe_numeric"("p" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."safe_numeric"("p" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."safe_numeric"("p" "text") TO "service_role";


--
-- Name: FUNCTION "set_work_order_number_trigger"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."set_work_order_number_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_work_order_number_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_work_order_number_trigger"() TO "service_role";


--
-- Name: FUNCTION "sync_animals"("_rows" "jsonb", "_source" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."sync_animals"("_rows" "jsonb", "_source" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."sync_animals"("_rows" "jsonb", "_source" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_animals"("_rows" "jsonb", "_source" "text") TO "service_role";


--
-- Name: FUNCTION "sync_biocide_usage_to_stock"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."sync_biocide_usage_to_stock"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_biocide_usage_to_stock"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_biocide_usage_to_stock"() TO "service_role";


--
-- Name: FUNCTION "touch_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "service_role";


--
-- Name: FUNCTION "trigger_calculate_withdrawal_on_usage"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."trigger_calculate_withdrawal_on_usage"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_calculate_withdrawal_on_usage"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_calculate_withdrawal_on_usage"() TO "service_role";


--
-- Name: FUNCTION "trigger_set_timestamp"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."trigger_set_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_set_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_set_timestamp"() TO "service_role";


--
-- Name: FUNCTION "unfreeze_user"("p_user_id" "uuid", "p_admin_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."unfreeze_user"("p_user_id" "uuid", "p_admin_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."unfreeze_user"("p_user_id" "uuid", "p_admin_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unfreeze_user"("p_user_id" "uuid", "p_admin_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "update_batch_qty_left"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_batch_qty_left"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_batch_qty_left"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_batch_qty_left"() TO "service_role";


--
-- Name: FUNCTION "update_cost_accumulation_project_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_cost_accumulation_project_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_cost_accumulation_project_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_cost_accumulation_project_updated_at"() TO "service_role";


--
-- Name: FUNCTION "update_cost_center_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_cost_center_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_cost_center_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_cost_center_updated_at"() TO "service_role";


--
-- Name: FUNCTION "update_farm_equipment_item_next_service_date"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_farm_equipment_item_next_service_date"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_farm_equipment_item_next_service_date"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_farm_equipment_item_next_service_date"() TO "service_role";


--
-- Name: FUNCTION "update_fire_extinguishers_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_fire_extinguishers_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_fire_extinguishers_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_fire_extinguishers_updated_at"() TO "service_role";


--
-- Name: FUNCTION "update_hoof_records_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_hoof_records_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_hoof_records_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_hoof_records_updated_at"() TO "service_role";


--
-- Name: FUNCTION "update_last_login"("p_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_last_login"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."update_last_login"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_last_login"("p_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "update_last_service_date_on_new_record"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_last_service_date_on_new_record"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_last_service_date_on_new_record"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_last_service_date_on_new_record"() TO "service_role";


--
-- Name: FUNCTION "update_schedule_on_work_order_complete"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_schedule_on_work_order_complete"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_schedule_on_work_order_complete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_schedule_on_work_order_complete"() TO "service_role";


--
-- Name: FUNCTION "update_shared_notepad_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_shared_notepad_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_shared_notepad_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_shared_notepad_updated_at"() TO "service_role";


--
-- Name: FUNCTION "update_teat_status_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_teat_status_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_teat_status_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_teat_status_updated_at"() TO "service_role";


--
-- Name: FUNCTION "update_updated_at_column"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";


--
-- Name: FUNCTION "update_user_password"("p_user_id" "uuid", "p_password" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_user_password"("p_user_id" "uuid", "p_password" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_user_password"("p_user_id" "uuid", "p_password" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_user_password"("p_user_id" "uuid", "p_password" "text") TO "service_role";


--
-- Name: FUNCTION "update_vehicle_last_service"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_vehicle_last_service"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_vehicle_last_service"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_vehicle_last_service"() TO "service_role";


--
-- Name: FUNCTION "update_work_order_costs"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_work_order_costs"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_work_order_costs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_work_order_costs"() TO "service_role";


--
-- Name: FUNCTION "upsert_animals_json"("payload" "jsonb"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."upsert_animals_json"("payload" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_animals_json"("payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_animals_json"("payload" "jsonb") TO "service_role";


--
-- Name: FUNCTION "upsert_animals_named"("_rows" "jsonb", "_deactivate_missing" boolean); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."upsert_animals_named"("_rows" "jsonb", "_deactivate_missing" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_animals_named"("_rows" "jsonb", "_deactivate_missing" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_animals_named"("_rows" "jsonb", "_deactivate_missing" boolean) TO "service_role";


--
-- Name: FUNCTION "upsert_gea_daily"("payload" "jsonb"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."upsert_gea_daily"("payload" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_gea_daily"("payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_gea_daily"("payload" "jsonb") TO "service_role";


--
-- Name: FUNCTION "upsert_milk_weight"("p_payload" "jsonb"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."upsert_milk_weight"("p_payload" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_milk_weight"("p_payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_milk_weight"("p_payload" "jsonb") TO "service_role";


--
-- Name: FUNCTION "upsert_milk_weight"("p_weight" integer, "p_measurement_timestamp" timestamp with time zone, "p_timezone" "text", "p_session_id" "text", "p_hose_status" "text", "p_stable_status" boolean, "p_raw_data" "jsonb"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."upsert_milk_weight"("p_weight" integer, "p_measurement_timestamp" timestamp with time zone, "p_timezone" "text", "p_session_id" "text", "p_hose_status" "text", "p_stable_status" boolean, "p_raw_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_milk_weight"("p_weight" integer, "p_measurement_timestamp" timestamp with time zone, "p_timezone" "text", "p_session_id" "text", "p_hose_status" "text", "p_stable_status" boolean, "p_raw_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_milk_weight"("p_weight" integer, "p_measurement_timestamp" timestamp with time zone, "p_timezone" "text", "p_session_id" "text", "p_hose_status" "text", "p_stable_status" boolean, "p_raw_data" "jsonb") TO "service_role";


--
-- Name: FUNCTION "validate_visit_medications"("p_visit_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."validate_visit_medications"("p_visit_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."validate_visit_medications"("p_visit_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_visit_medications"("p_visit_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "verify_password"("p_email" "text", "p_password" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."verify_password"("p_email" "text", "p_password" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."verify_password"("p_email" "text", "p_password" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_password"("p_email" "text", "p_password" "text") TO "service_role";


--
-- Name: FUNCTION "visit_needs_medication_entry"("p_visit_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."visit_needs_medication_entry"("p_visit_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."visit_needs_medication_entry"("p_visit_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."visit_needs_medication_entry"("p_visit_id" "uuid") TO "service_role";


--
-- Name: TABLE "animal_synchronizations"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."animal_synchronizations" TO "anon";
GRANT ALL ON TABLE "public"."animal_synchronizations" TO "authenticated";
GRANT ALL ON TABLE "public"."animal_synchronizations" TO "service_role";


--
-- Name: TABLE "animals"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."animals" TO "anon";
GRANT ALL ON TABLE "public"."animals" TO "authenticated";
GRANT ALL ON TABLE "public"."animals" TO "service_role";


--
-- Name: TABLE "synchronization_protocols"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."synchronization_protocols" TO "anon";
GRANT ALL ON TABLE "public"."synchronization_protocols" TO "authenticated";
GRANT ALL ON TABLE "public"."synchronization_protocols" TO "service_role";


--
-- Name: TABLE "animal_milk_loss_by_synchronization"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."animal_milk_loss_by_synchronization" TO "anon";
GRANT ALL ON TABLE "public"."animal_milk_loss_by_synchronization" TO "authenticated";
GRANT ALL ON TABLE "public"."animal_milk_loss_by_synchronization" TO "service_role";


--
-- Name: TABLE "animal_visits"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."animal_visits" TO "anon";
GRANT ALL ON TABLE "public"."animal_visits" TO "authenticated";
GRANT ALL ON TABLE "public"."animal_visits" TO "service_role";


--
-- Name: TABLE "animal_visit_summary"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."animal_visit_summary" TO "anon";
GRANT ALL ON TABLE "public"."animal_visit_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."animal_visit_summary" TO "service_role";


--
-- Name: TABLE "batch_waste_tracking"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."batch_waste_tracking" TO "anon";
GRANT ALL ON TABLE "public"."batch_waste_tracking" TO "authenticated";
GRANT ALL ON TABLE "public"."batch_waste_tracking" TO "service_role";


--
-- Name: TABLE "batches"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."batches" TO "anon";
GRANT ALL ON TABLE "public"."batches" TO "authenticated";
GRANT ALL ON TABLE "public"."batches" TO "service_role";


--
-- Name: TABLE "biocide_usage"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."biocide_usage" TO "anon";
GRANT ALL ON TABLE "public"."biocide_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."biocide_usage" TO "service_role";


--
-- Name: TABLE "cost_accumulation_documents"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."cost_accumulation_documents" TO "anon";
GRANT ALL ON TABLE "public"."cost_accumulation_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."cost_accumulation_documents" TO "service_role";


--
-- Name: TABLE "cost_accumulation_items"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."cost_accumulation_items" TO "anon";
GRANT ALL ON TABLE "public"."cost_accumulation_items" TO "authenticated";
GRANT ALL ON TABLE "public"."cost_accumulation_items" TO "service_role";


--
-- Name: TABLE "cost_accumulation_projects"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."cost_accumulation_projects" TO "anon";
GRANT ALL ON TABLE "public"."cost_accumulation_projects" TO "authenticated";
GRANT ALL ON TABLE "public"."cost_accumulation_projects" TO "service_role";


--
-- Name: TABLE "cost_accumulation_project_summary"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."cost_accumulation_project_summary" TO "anon";
GRANT ALL ON TABLE "public"."cost_accumulation_project_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."cost_accumulation_project_summary" TO "service_role";


--
-- Name: TABLE "cost_centers"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."cost_centers" TO "anon";
GRANT ALL ON TABLE "public"."cost_centers" TO "authenticated";
GRANT ALL ON TABLE "public"."cost_centers" TO "service_role";


--
-- Name: TABLE "equipment_invoice_item_assignments"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."equipment_invoice_item_assignments" TO "anon";
GRANT ALL ON TABLE "public"."equipment_invoice_item_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."equipment_invoice_item_assignments" TO "service_role";


--
-- Name: TABLE "equipment_invoice_items"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."equipment_invoice_items" TO "anon";
GRANT ALL ON TABLE "public"."equipment_invoice_items" TO "authenticated";
GRANT ALL ON TABLE "public"."equipment_invoice_items" TO "service_role";


--
-- Name: TABLE "equipment_invoices"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."equipment_invoices" TO "anon";
GRANT ALL ON TABLE "public"."equipment_invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."equipment_invoices" TO "service_role";


--
-- Name: TABLE "cost_center_direct_summary"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."cost_center_direct_summary" TO "anon";
GRANT ALL ON TABLE "public"."cost_center_direct_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."cost_center_direct_summary" TO "service_role";


--
-- Name: TABLE "equipment_categories"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."equipment_categories" TO "anon";
GRANT ALL ON TABLE "public"."equipment_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."equipment_categories" TO "service_role";


--
-- Name: TABLE "equipment_products"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."equipment_products" TO "anon";
GRANT ALL ON TABLE "public"."equipment_products" TO "authenticated";
GRANT ALL ON TABLE "public"."equipment_products" TO "service_role";


--
-- Name: TABLE "users"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";


--
-- Name: TABLE "cost_center_parts_usage"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."cost_center_parts_usage" TO "anon";
GRANT ALL ON TABLE "public"."cost_center_parts_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."cost_center_parts_usage" TO "service_role";


--
-- Name: TABLE "cost_center_summary_with_children"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."cost_center_summary_with_children" TO "anon";
GRANT ALL ON TABLE "public"."cost_center_summary_with_children" TO "authenticated";
GRANT ALL ON TABLE "public"."cost_center_summary_with_children" TO "service_role";


--
-- Name: TABLE "cost_center_summary"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."cost_center_summary" TO "anon";
GRANT ALL ON TABLE "public"."cost_center_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."cost_center_summary" TO "service_role";


--
-- Name: TABLE "course_doses"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."course_doses" TO "anon";
GRANT ALL ON TABLE "public"."course_doses" TO "authenticated";
GRANT ALL ON TABLE "public"."course_doses" TO "service_role";


--
-- Name: TABLE "course_medication_schedules"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."course_medication_schedules" TO "anon";
GRANT ALL ON TABLE "public"."course_medication_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."course_medication_schedules" TO "service_role";


--
-- Name: TABLE "diseases"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."diseases" TO "anon";
GRANT ALL ON TABLE "public"."diseases" TO "authenticated";
GRANT ALL ON TABLE "public"."diseases" TO "service_role";


--
-- Name: TABLE "equipment_batches"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."equipment_batches" TO "anon";
GRANT ALL ON TABLE "public"."equipment_batches" TO "authenticated";
GRANT ALL ON TABLE "public"."equipment_batches" TO "service_role";


--
-- Name: TABLE "equipment_issuance_items"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."equipment_issuance_items" TO "anon";
GRANT ALL ON TABLE "public"."equipment_issuance_items" TO "authenticated";
GRANT ALL ON TABLE "public"."equipment_issuance_items" TO "service_role";


--
-- Name: TABLE "equipment_issuances"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."equipment_issuances" TO "anon";
GRANT ALL ON TABLE "public"."equipment_issuances" TO "authenticated";
GRANT ALL ON TABLE "public"."equipment_issuances" TO "service_role";


--
-- Name: TABLE "equipment_items_on_loan"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."equipment_items_on_loan" TO "anon";
GRANT ALL ON TABLE "public"."equipment_items_on_loan" TO "authenticated";
GRANT ALL ON TABLE "public"."equipment_items_on_loan" TO "service_role";


--
-- Name: TABLE "equipment_locations"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."equipment_locations" TO "anon";
GRANT ALL ON TABLE "public"."equipment_locations" TO "authenticated";
GRANT ALL ON TABLE "public"."equipment_locations" TO "service_role";


--
-- Name: TABLE "equipment_stock_movements"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."equipment_stock_movements" TO "anon";
GRANT ALL ON TABLE "public"."equipment_stock_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."equipment_stock_movements" TO "service_role";


--
-- Name: TABLE "equipment_suppliers"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."equipment_suppliers" TO "anon";
GRANT ALL ON TABLE "public"."equipment_suppliers" TO "authenticated";
GRANT ALL ON TABLE "public"."equipment_suppliers" TO "service_role";


--
-- Name: TABLE "equipment_unassigned_invoice_items"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."equipment_unassigned_invoice_items" TO "anon";
GRANT ALL ON TABLE "public"."equipment_unassigned_invoice_items" TO "authenticated";
GRANT ALL ON TABLE "public"."equipment_unassigned_invoice_items" TO "service_role";


--
-- Name: TABLE "equipment_warehouse_stock"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."equipment_warehouse_stock" TO "anon";
GRANT ALL ON TABLE "public"."equipment_warehouse_stock" TO "authenticated";
GRANT ALL ON TABLE "public"."equipment_warehouse_stock" TO "service_role";


--
-- Name: TABLE "farm_equipment"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."farm_equipment" TO "anon";
GRANT ALL ON TABLE "public"."farm_equipment" TO "authenticated";
GRANT ALL ON TABLE "public"."farm_equipment" TO "service_role";


--
-- Name: TABLE "farm_equipment_items"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."farm_equipment_items" TO "anon";
GRANT ALL ON TABLE "public"."farm_equipment_items" TO "authenticated";
GRANT ALL ON TABLE "public"."farm_equipment_items" TO "service_role";


--
-- Name: TABLE "farm_equipment_service_parts"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."farm_equipment_service_parts" TO "anon";
GRANT ALL ON TABLE "public"."farm_equipment_service_parts" TO "authenticated";
GRANT ALL ON TABLE "public"."farm_equipment_service_parts" TO "service_role";


--
-- Name: TABLE "farm_equipment_service_records"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."farm_equipment_service_records" TO "anon";
GRANT ALL ON TABLE "public"."farm_equipment_service_records" TO "authenticated";
GRANT ALL ON TABLE "public"."farm_equipment_service_records" TO "service_role";


--
-- Name: TABLE "farm_equipment_cost_overview"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."farm_equipment_cost_overview" TO "anon";
GRANT ALL ON TABLE "public"."farm_equipment_cost_overview" TO "authenticated";
GRANT ALL ON TABLE "public"."farm_equipment_cost_overview" TO "service_role";


--
-- Name: TABLE "farm_equipment_items_detail"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."farm_equipment_items_detail" TO "anon";
GRANT ALL ON TABLE "public"."farm_equipment_items_detail" TO "authenticated";
GRANT ALL ON TABLE "public"."farm_equipment_items_detail" TO "service_role";


--
-- Name: TABLE "farm_equipment_service_cost_summary"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."farm_equipment_service_cost_summary" TO "anon";
GRANT ALL ON TABLE "public"."farm_equipment_service_cost_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."farm_equipment_service_cost_summary" TO "service_role";


--
-- Name: TABLE "farm_equipment_service_details"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."farm_equipment_service_details" TO "anon";
GRANT ALL ON TABLE "public"."farm_equipment_service_details" TO "authenticated";
GRANT ALL ON TABLE "public"."farm_equipment_service_details" TO "service_role";


--
-- Name: TABLE "farm_equipment_summary"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."farm_equipment_summary" TO "anon";
GRANT ALL ON TABLE "public"."farm_equipment_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."farm_equipment_summary" TO "service_role";


--
-- Name: TABLE "fire_extinguishers"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."fire_extinguishers" TO "anon";
GRANT ALL ON TABLE "public"."fire_extinguishers" TO "authenticated";
GRANT ALL ON TABLE "public"."fire_extinguishers" TO "service_role";


--
-- Name: TABLE "gea_daily_ataskaita1"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."gea_daily_ataskaita1" TO "anon";
GRANT ALL ON TABLE "public"."gea_daily_ataskaita1" TO "authenticated";
GRANT ALL ON TABLE "public"."gea_daily_ataskaita1" TO "service_role";


--
-- Name: TABLE "gea_daily_ataskaita2"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."gea_daily_ataskaita2" TO "anon";
GRANT ALL ON TABLE "public"."gea_daily_ataskaita2" TO "authenticated";
GRANT ALL ON TABLE "public"."gea_daily_ataskaita2" TO "service_role";


--
-- Name: TABLE "gea_daily_ataskaita3"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."gea_daily_ataskaita3" TO "anon";
GRANT ALL ON TABLE "public"."gea_daily_ataskaita3" TO "authenticated";
GRANT ALL ON TABLE "public"."gea_daily_ataskaita3" TO "service_role";


--
-- Name: TABLE "gea_daily_imports"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."gea_daily_imports" TO "anon";
GRANT ALL ON TABLE "public"."gea_daily_imports" TO "authenticated";
GRANT ALL ON TABLE "public"."gea_daily_imports" TO "service_role";


--
-- Name: TABLE "gea_daily_cows_joined"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."gea_daily_cows_joined" TO "anon";
GRANT ALL ON TABLE "public"."gea_daily_cows_joined" TO "authenticated";
GRANT ALL ON TABLE "public"."gea_daily_cows_joined" TO "service_role";


--
-- Name: TABLE "hoof_records"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."hoof_records" TO "anon";
GRANT ALL ON TABLE "public"."hoof_records" TO "authenticated";
GRANT ALL ON TABLE "public"."hoof_records" TO "service_role";


--
-- Name: TABLE "hoof_analytics_summary"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."hoof_analytics_summary" TO "anon";
GRANT ALL ON TABLE "public"."hoof_analytics_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."hoof_analytics_summary" TO "service_role";


--
-- Name: TABLE "hoof_condition_codes"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."hoof_condition_codes" TO "anon";
GRANT ALL ON TABLE "public"."hoof_condition_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."hoof_condition_codes" TO "service_role";


--
-- Name: TABLE "hoof_condition_trends"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."hoof_condition_trends" TO "anon";
GRANT ALL ON TABLE "public"."hoof_condition_trends" TO "authenticated";
GRANT ALL ON TABLE "public"."hoof_condition_trends" TO "service_role";


--
-- Name: TABLE "hoof_followup_needed"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."hoof_followup_needed" TO "anon";
GRANT ALL ON TABLE "public"."hoof_followup_needed" TO "authenticated";
GRANT ALL ON TABLE "public"."hoof_followup_needed" TO "service_role";


--
-- Name: TABLE "hoof_recurring_problems"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."hoof_recurring_problems" TO "anon";
GRANT ALL ON TABLE "public"."hoof_recurring_problems" TO "authenticated";
GRANT ALL ON TABLE "public"."hoof_recurring_problems" TO "service_role";


--
-- Name: TABLE "insemination_inventory"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."insemination_inventory" TO "anon";
GRANT ALL ON TABLE "public"."insemination_inventory" TO "authenticated";
GRANT ALL ON TABLE "public"."insemination_inventory" TO "service_role";


--
-- Name: TABLE "insemination_products"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."insemination_products" TO "anon";
GRANT ALL ON TABLE "public"."insemination_products" TO "authenticated";
GRANT ALL ON TABLE "public"."insemination_products" TO "service_role";


--
-- Name: TABLE "insemination_records"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."insemination_records" TO "anon";
GRANT ALL ON TABLE "public"."insemination_records" TO "authenticated";
GRANT ALL ON TABLE "public"."insemination_records" TO "service_role";


--
-- Name: TABLE "invoice_items"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."invoice_items" TO "anon";
GRANT ALL ON TABLE "public"."invoice_items" TO "authenticated";
GRANT ALL ON TABLE "public"."invoice_items" TO "service_role";


--
-- Name: TABLE "invoices"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."invoices" TO "anon";
GRANT ALL ON TABLE "public"."invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."invoices" TO "service_role";


--
-- Name: TABLE "maintenance_schedules"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."maintenance_schedules" TO "anon";
GRANT ALL ON TABLE "public"."maintenance_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."maintenance_schedules" TO "service_role";


--
-- Name: TABLE "maintenance_work_orders"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."maintenance_work_orders" TO "anon";
GRANT ALL ON TABLE "public"."maintenance_work_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."maintenance_work_orders" TO "service_role";


--
-- Name: TABLE "medical_waste"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."medical_waste" TO "anon";
GRANT ALL ON TABLE "public"."medical_waste" TO "authenticated";
GRANT ALL ON TABLE "public"."medical_waste" TO "service_role";


--
-- Name: TABLE "milk_composition_tests"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."milk_composition_tests" TO "anon";
GRANT ALL ON TABLE "public"."milk_composition_tests" TO "authenticated";
GRANT ALL ON TABLE "public"."milk_composition_tests" TO "service_role";


--
-- Name: TABLE "milk_producers"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."milk_producers" TO "anon";
GRANT ALL ON TABLE "public"."milk_producers" TO "authenticated";
GRANT ALL ON TABLE "public"."milk_producers" TO "service_role";


--
-- Name: TABLE "milk_quality_tests"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."milk_quality_tests" TO "anon";
GRANT ALL ON TABLE "public"."milk_quality_tests" TO "authenticated";
GRANT ALL ON TABLE "public"."milk_quality_tests" TO "service_role";


--
-- Name: TABLE "milk_weights"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."milk_weights" TO "anon";
GRANT ALL ON TABLE "public"."milk_weights" TO "authenticated";
GRANT ALL ON TABLE "public"."milk_weights" TO "service_role";


--
-- Name: TABLE "milk_data_combined"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."milk_data_combined" TO "anon";
GRANT ALL ON TABLE "public"."milk_data_combined" TO "authenticated";
GRANT ALL ON TABLE "public"."milk_data_combined" TO "service_role";


--
-- Name: TABLE "milk_production"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."milk_production" TO "anon";
GRANT ALL ON TABLE "public"."milk_production" TO "authenticated";
GRANT ALL ON TABLE "public"."milk_production" TO "service_role";


--
-- Name: TABLE "milk_scrape_sessions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."milk_scrape_sessions" TO "anon";
GRANT ALL ON TABLE "public"."milk_scrape_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."milk_scrape_sessions" TO "service_role";


--
-- Name: TABLE "milk_test_summaries"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."milk_test_summaries" TO "anon";
GRANT ALL ON TABLE "public"."milk_test_summaries" TO "authenticated";
GRANT ALL ON TABLE "public"."milk_test_summaries" TO "service_role";


--
-- Name: TABLE "milk_tests"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."milk_tests" TO "anon";
GRANT ALL ON TABLE "public"."milk_tests" TO "authenticated";
GRANT ALL ON TABLE "public"."milk_tests" TO "service_role";


--
-- Name: TABLE "ppe_issuance_records"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."ppe_issuance_records" TO "anon";
GRANT ALL ON TABLE "public"."ppe_issuance_records" TO "authenticated";
GRANT ALL ON TABLE "public"."ppe_issuance_records" TO "service_role";


--
-- Name: TABLE "ppe_items"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."ppe_items" TO "anon";
GRANT ALL ON TABLE "public"."ppe_items" TO "authenticated";
GRANT ALL ON TABLE "public"."ppe_items" TO "service_role";


--
-- Name: TABLE "product_quality_reviews"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."product_quality_reviews" TO "anon";
GRANT ALL ON TABLE "public"."product_quality_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."product_quality_reviews" TO "service_role";


--
-- Name: TABLE "product_quality_schedules"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."product_quality_schedules" TO "anon";
GRANT ALL ON TABLE "public"."product_quality_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."product_quality_schedules" TO "service_role";


--
-- Name: TABLE "products"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";


--
-- Name: TABLE "shared_notepad"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."shared_notepad" TO "anon";
GRANT ALL ON TABLE "public"."shared_notepad" TO "authenticated";
GRANT ALL ON TABLE "public"."shared_notepad" TO "service_role";


--
-- Name: TABLE "usage_items"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."usage_items" TO "anon";
GRANT ALL ON TABLE "public"."usage_items" TO "authenticated";
GRANT ALL ON TABLE "public"."usage_items" TO "service_role";


--
-- Name: TABLE "stock_by_batch"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."stock_by_batch" TO "anon";
GRANT ALL ON TABLE "public"."stock_by_batch" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_by_batch" TO "service_role";


--
-- Name: TABLE "stock_by_product"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."stock_by_product" TO "anon";
GRANT ALL ON TABLE "public"."stock_by_product" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_by_product" TO "service_role";


--
-- Name: TABLE "suppliers"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."suppliers" TO "anon";
GRANT ALL ON TABLE "public"."suppliers" TO "authenticated";
GRANT ALL ON TABLE "public"."suppliers" TO "service_role";


--
-- Name: TABLE "synchronization_steps"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."synchronization_steps" TO "anon";
GRANT ALL ON TABLE "public"."synchronization_steps" TO "authenticated";
GRANT ALL ON TABLE "public"."synchronization_steps" TO "service_role";


--
-- Name: TABLE "system_settings"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."system_settings" TO "anon";
GRANT ALL ON TABLE "public"."system_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."system_settings" TO "service_role";


--
-- Name: TABLE "teat_status"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."teat_status" TO "anon";
GRANT ALL ON TABLE "public"."teat_status" TO "authenticated";
GRANT ALL ON TABLE "public"."teat_status" TO "service_role";


--
-- Name: TABLE "tool_movements"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."tool_movements" TO "anon";
GRANT ALL ON TABLE "public"."tool_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."tool_movements" TO "service_role";


--
-- Name: TABLE "tools"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."tools" TO "anon";
GRANT ALL ON TABLE "public"."tools" TO "authenticated";
GRANT ALL ON TABLE "public"."tools" TO "service_role";


--
-- Name: TABLE "tool_parts_usage"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."tool_parts_usage" TO "anon";
GRANT ALL ON TABLE "public"."tool_parts_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."tool_parts_usage" TO "service_role";


--
-- Name: TABLE "treatment_courses"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."treatment_courses" TO "anon";
GRANT ALL ON TABLE "public"."treatment_courses" TO "authenticated";
GRANT ALL ON TABLE "public"."treatment_courses" TO "service_role";


--
-- Name: TABLE "treatments"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."treatments" TO "anon";
GRANT ALL ON TABLE "public"."treatments" TO "authenticated";
GRANT ALL ON TABLE "public"."treatments" TO "service_role";


--
-- Name: TABLE "treatment_history_view"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."treatment_history_view" TO "anon";
GRANT ALL ON TABLE "public"."treatment_history_view" TO "authenticated";
GRANT ALL ON TABLE "public"."treatment_history_view" TO "service_role";


--
-- Name: TABLE "treatment_milk_loss_summary"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."treatment_milk_loss_summary" TO "anon";
GRANT ALL ON TABLE "public"."treatment_milk_loss_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."treatment_milk_loss_summary" TO "service_role";


--
-- Name: TABLE "user_audit_logs"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."user_audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."user_audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."user_audit_logs" TO "service_role";


--
-- Name: TABLE "vaccinations"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."vaccinations" TO "anon";
GRANT ALL ON TABLE "public"."vaccinations" TO "authenticated";
GRANT ALL ON TABLE "public"."vaccinations" TO "service_role";


--
-- Name: TABLE "vehicle_assignments"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."vehicle_assignments" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_assignments" TO "service_role";


--
-- Name: TABLE "vehicle_service_visits"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."vehicle_service_visits" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_service_visits" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_service_visits" TO "service_role";


--
-- Name: TABLE "vehicle_visit_parts"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."vehicle_visit_parts" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_visit_parts" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_visit_parts" TO "service_role";


--
-- Name: TABLE "vehicles"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."vehicles" TO "anon";
GRANT ALL ON TABLE "public"."vehicles" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicles" TO "service_role";


--
-- Name: TABLE "work_order_parts"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."work_order_parts" TO "anon";
GRANT ALL ON TABLE "public"."work_order_parts" TO "authenticated";
GRANT ALL ON TABLE "public"."work_order_parts" TO "service_role";


--
-- Name: TABLE "vehicle_maintenance_cost_summary"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."vehicle_maintenance_cost_summary" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_maintenance_cost_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_maintenance_cost_summary" TO "service_role";


--
-- Name: TABLE "vehicle_cost_overview"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."vehicle_cost_overview" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_cost_overview" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_cost_overview" TO "service_role";


--
-- Name: TABLE "vehicle_documents"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."vehicle_documents" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_documents" TO "service_role";


--
-- Name: TABLE "vehicle_fuel_records"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."vehicle_fuel_records" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_fuel_records" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_fuel_records" TO "service_role";


--
-- Name: TABLE "vehicle_parts_usage"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."vehicle_parts_usage" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_parts_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_parts_usage" TO "service_role";


--
-- Name: TABLE "vehicle_service_history"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."vehicle_service_history" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_service_history" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_service_history" TO "service_role";


--
-- Name: TABLE "vehicle_service_visit_details"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."vehicle_service_visit_details" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_service_visit_details" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_service_visit_details" TO "service_role";


--
-- Name: TABLE "vehicle_work_order_details"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."vehicle_work_order_details" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_work_order_details" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_work_order_details" TO "service_role";


--
-- Name: TABLE "vet_analytics_summary"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."vet_analytics_summary" TO "anon";
GRANT ALL ON TABLE "public"."vet_analytics_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."vet_analytics_summary" TO "service_role";


--
-- Name: TABLE "vw_animal_cost_analytics"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."vw_animal_cost_analytics" TO "anon";
GRANT ALL ON TABLE "public"."vw_animal_cost_analytics" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_animal_cost_analytics" TO "service_role";


--
-- Name: TABLE "vw_animal_product_usage"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."vw_animal_product_usage" TO "anon";
GRANT ALL ON TABLE "public"."vw_animal_product_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_animal_product_usage" TO "service_role";


--
-- Name: TABLE "vw_animal_treatment_outcomes"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."vw_animal_treatment_outcomes" TO "anon";
GRANT ALL ON TABLE "public"."vw_animal_treatment_outcomes" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_animal_treatment_outcomes" TO "service_role";


--
-- Name: TABLE "vw_animal_visit_analytics"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."vw_animal_visit_analytics" TO "anon";
GRANT ALL ON TABLE "public"."vw_animal_visit_analytics" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_animal_visit_analytics" TO "service_role";


--
-- Name: TABLE "vw_biocide_journal"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."vw_biocide_journal" TO "anon";
GRANT ALL ON TABLE "public"."vw_biocide_journal" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_biocide_journal" TO "service_role";


--
-- Name: TABLE "vw_course_schedules"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."vw_course_schedules" TO "anon";
GRANT ALL ON TABLE "public"."vw_course_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_course_schedules" TO "service_role";


--
-- Name: TABLE "vw_medical_waste"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."vw_medical_waste" TO "anon";
GRANT ALL ON TABLE "public"."vw_medical_waste" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_medical_waste" TO "service_role";


--
-- Name: TABLE "vw_medical_waste_with_details"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."vw_medical_waste_with_details" TO "anon";
GRANT ALL ON TABLE "public"."vw_medical_waste_with_details" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_medical_waste_with_details" TO "service_role";


--
-- Name: TABLE "vw_milk_analytics"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."vw_milk_analytics" TO "anon";
GRANT ALL ON TABLE "public"."vw_milk_analytics" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_milk_analytics" TO "service_role";


--
-- Name: TABLE "vw_owner_admin_meds"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."vw_owner_admin_meds" TO "anon";
GRANT ALL ON TABLE "public"."vw_owner_admin_meds" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_owner_admin_meds" TO "service_role";


--
-- Name: TABLE "vw_spend_per_animal"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."vw_spend_per_animal" TO "anon";
GRANT ALL ON TABLE "public"."vw_spend_per_animal" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_spend_per_animal" TO "service_role";


--
-- Name: TABLE "vw_teat_treatment_analytics"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."vw_teat_treatment_analytics" TO "anon";
GRANT ALL ON TABLE "public"."vw_teat_treatment_analytics" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_teat_treatment_analytics" TO "service_role";


--
-- Name: TABLE "vw_treated_animals"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."vw_treated_animals" TO "anon";
GRANT ALL ON TABLE "public"."vw_treated_animals" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_treated_animals" TO "service_role";


--
-- Name: TABLE "vw_treated_animals_detailed"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."vw_treated_animals_detailed" TO "anon";
GRANT ALL ON TABLE "public"."vw_treated_animals_detailed" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_treated_animals_detailed" TO "service_role";


--
-- Name: TABLE "vw_vet_drug_journal"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."vw_vet_drug_journal" TO "anon";
GRANT ALL ON TABLE "public"."vw_vet_drug_journal" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_vet_drug_journal" TO "service_role";


--
-- Name: TABLE "vw_withdrawal_status"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."vw_withdrawal_status" TO "anon";
GRANT ALL ON TABLE "public"."vw_withdrawal_status" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_withdrawal_status" TO "service_role";


--
-- Name: TABLE "work_order_labor"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."work_order_labor" TO "anon";
GRANT ALL ON TABLE "public"."work_order_labor" TO "authenticated";
GRANT ALL ON TABLE "public"."work_order_labor" TO "service_role";


--
-- Name: TABLE "worker_schedules"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."worker_schedules" TO "anon";
GRANT ALL ON TABLE "public"."worker_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."worker_schedules" TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- PostgreSQL database dump complete
--

-- \unrestrict EDzbElkTtxG1psRHPqQpMZabDhk04uJCqa6r8p21rBLGO6uIp9JU6uOXYNewSPq

