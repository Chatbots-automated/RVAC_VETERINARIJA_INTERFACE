-- ============================================
-- GEA DAILY: Safe cast helper functions
-- ============================================

-- ---------- SAFE CAST HELPERS ----------
create or replace function public.safe_date(p text)
returns date
language plpgsql
immutable
as $$
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

create or replace function public.safe_int(p text)
returns int
language plpgsql
immutable
as $$
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
$$;

create or replace function public.safe_numeric(p text)
returns numeric
language plpgsql
immutable
as $$
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
$$;

create or replace function public.safe_bool_lt(p text)
returns boolean
language plpgsql
immutable
as $$
declare s text;
begin
  s := lower(btrim(coalesce(p,'')));
  if s in ('taip','yes','true','1','y') then return true; end if;
  if s in ('ne','no','false','0','n') then return false; end if;
  return null;
end;
$$;

-- Grant permissions to authenticated users
grant execute on function public.safe_date(text) to authenticated;
grant execute on function public.safe_int(text) to authenticated;
grant execute on function public.safe_numeric(text) to authenticated;
grant execute on function public.safe_bool_lt(text) to authenticated;
