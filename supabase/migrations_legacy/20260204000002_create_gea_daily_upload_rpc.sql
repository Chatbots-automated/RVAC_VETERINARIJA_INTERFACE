-- ============================================
-- GEA DAILY RPC: public.gea_daily_upload(payload jsonb)
-- Completely safe against "******" in numeric fields.
-- ============================================

create or replace function public.gea_daily_upload(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

-- Set correct permissions
revoke all on function public.gea_daily_upload(jsonb) from public;
grant execute on function public.gea_daily_upload(jsonb) to authenticated;

-- Notify PostgREST to reload schema cache
notify pgrst, 'reload schema';
