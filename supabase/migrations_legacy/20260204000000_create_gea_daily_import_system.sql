-- ============================================
-- GEA DAILY: imports + 3 ataskaita tables
-- ============================================

begin;

create extension if not exists "pgcrypto";

create table if not exists public.gea_daily_imports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid null references auth.users(id) on delete set null,

  source_filename text null,
  source_sha256 text null,
  source_size_bytes bigint null,

  marker_i1 int null,
  marker_i2 int null,
  marker_i3 int null,

  count_ataskaita1 int not null default 0,
  count_ataskaita2 int not null default 0,
  count_ataskaita3 int not null default 0
);

create index if not exists idx_gea_daily_imports_created_at
  on public.gea_daily_imports(created_at desc);

create table if not exists public.gea_daily_ataskaita1 (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.gea_daily_imports(id) on delete cascade,
  created_at timestamptz not null default now(),

  cow_number text not null,
  ear_number text null,
  cow_state text null,
  group_number text null,

  pregnant_since date null,
  lactation_days int null,
  inseminated_at date null,
  pregnant_days int null,
  next_pregnancy_date date null,
  days_until_waiting_pregnancy int null,

  raw jsonb null
);

create index if not exists idx_gea_a1_import_id on public.gea_daily_ataskaita1(import_id);
create index if not exists idx_gea_a1_cow_number on public.gea_daily_ataskaita1(cow_number);
create unique index if not exists uq_gea_a1_import_cow on public.gea_daily_ataskaita1(import_id, cow_number);

create table if not exists public.gea_daily_ataskaita2 (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.gea_daily_imports(id) on delete cascade,
  created_at timestamptz not null default now(),

  cow_number text not null,
  genetic_worth text null,
  blood_line text null,
  avg_milk_prod_weight numeric null,
  produce_milk boolean null,

  last_milking_date date null,
  last_milking_time text null,
  last_milking_weight numeric null,

  milkings jsonb not null default '[]'::jsonb,
  raw jsonb null
);

create index if not exists idx_gea_a2_import_id on public.gea_daily_ataskaita2(import_id);
create index if not exists idx_gea_a2_cow_number on public.gea_daily_ataskaita2(cow_number);
create unique index if not exists uq_gea_a2_import_cow on public.gea_daily_ataskaita2(import_id, cow_number);
create index if not exists idx_gea_a2_milkings_gin on public.gea_daily_ataskaita2 using gin (milkings);

create table if not exists public.gea_daily_ataskaita3 (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.gea_daily_imports(id) on delete cascade,
  created_at timestamptz not null default now(),

  cow_number text not null,

  teat_missing_right_back boolean null,
  teat_missing_back_left boolean null,
  teat_missing_front_left boolean null,
  teat_missing_front_right boolean null,

  insemination_count int null,
  bull_1 text null,
  bull_2 text null,
  bull_3 text null,
  lactation_number int null,

  raw jsonb null
);

create index if not exists idx_gea_a3_import_id on public.gea_daily_ataskaita3(import_id);
create index if not exists idx_gea_a3_cow_number on public.gea_daily_ataskaita3(cow_number);
create unique index if not exists uq_gea_a3_import_cow on public.gea_daily_ataskaita3(import_id, cow_number);

create or replace view public.gea_daily_cows_joined as
select
  i.id as import_id,
  i.created_at as import_created_at,
  coalesce(a1.cow_number, a2.cow_number, a3.cow_number) as cow_number,

  a1.ear_number,
  a1.cow_state,
  a1.group_number,
  a1.pregnant_since,
  a1.lactation_days,
  a1.inseminated_at,
  a1.pregnant_days,
  a1.next_pregnancy_date,
  a1.days_until_waiting_pregnancy,

  a2.genetic_worth,
  a2.blood_line,
  a2.avg_milk_prod_weight,
  a2.produce_milk,
  a2.last_milking_date,
  a2.last_milking_time,
  a2.last_milking_weight,
  a2.milkings,

  a3.teat_missing_right_back,
  a3.teat_missing_back_left,
  a3.teat_missing_front_left,
  a3.teat_missing_front_right,
  a3.insemination_count,
  a3.bull_1,
  a3.bull_2,
  a3.bull_3,
  a3.lactation_number

from public.gea_daily_imports i
left join public.gea_daily_ataskaita1 a1 on a1.import_id = i.id
left join public.gea_daily_ataskaita2 a2 on a2.import_id = i.id and a2.cow_number = a1.cow_number
left join public.gea_daily_ataskaita3 a3 on a3.import_id = i.id and a3.cow_number = coalesce(a1.cow_number, a2.cow_number);

commit;
