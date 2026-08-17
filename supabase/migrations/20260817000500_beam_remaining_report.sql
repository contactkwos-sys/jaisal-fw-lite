-- Beam Remaining Report: machine-wise loaded beams + daily production deduct

-- Machine-wise loaded beam master
create table if not exists public.beam_loading (
  id uuid primary key default gen_random_uuid(),
  machine_no text not null,
  item_name text not null,
  quality text,
  pipe_no text,
  beam_count int not null default 1,        -- single/double beam
  meter_per_beam numeric not null,           -- e.g. 3000
  total_loaded_meter numeric generated always as (beam_count * meter_per_beam) stored,
  remaining_meter numeric not null,          -- starts = total_loaded_meter, then auto-deducts
  loaded_date date not null default current_date,
  status text default 'RUNNING',             -- RUNNING / STOP
  created_at timestamptz default now()
);

-- Daily production entries (link to beam_loading via machine_no)
create table if not exists public.daily_beam_production (
  id uuid primary key default gen_random_uuid(),
  beam_loading_id uuid references public.beam_loading(id) on delete cascade,
  machine_no text not null,
  production_date date not null default current_date,
  production_meter numeric not null default 0,
  efficiency numeric,
  remark text,
  created_at timestamptz default now(),
  unique(beam_loading_id, production_date)
);

-- Auto-deduct trigger: production insert/update -> remaining_meter update
create or replace function public.fn_deduct_beam_meter()
returns trigger as $$
begin
  update public.beam_loading
  set remaining_meter = greatest(
        total_loaded_meter - (
          select coalesce(sum(production_meter),0)
          from public.daily_beam_production
          where beam_loading_id = new.beam_loading_id
        ), 0)
  where id = new.beam_loading_id;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_deduct_beam_meter on public.daily_beam_production;
create trigger trg_deduct_beam_meter
after insert or update on public.daily_beam_production
for each row execute function public.fn_deduct_beam_meter();

-- Remain days view (7-day rolling average production)
create or replace view public.v_beam_remaining_report as
select
  bl.machine_no,
  bl.item_name,
  bl.quality,
  bl.remaining_meter,
  coalesce(avg7.avg_prod, 0) as avg_daily_production,
  case when coalesce(avg7.avg_prod,0) > 0
       then round(bl.remaining_meter / avg7.avg_prod, 1)
       else null end as remain_days,
  today.production_meter as today_production,
  bl.status
from public.beam_loading bl
left join (
  select beam_loading_id, avg(production_meter) as avg_prod
  from public.daily_beam_production
  where production_date >= current_date - interval '7 days'
  group by beam_loading_id
) avg7 on avg7.beam_loading_id = bl.id
left join (
  select beam_loading_id, production_meter
  from public.daily_beam_production
  where production_date = current_date
) today on today.beam_loading_id = bl.id;

-- RLS (same pattern as colourwise stock master tables)
alter table public.beam_loading enable row level security;
alter table public.daily_beam_production enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['beam_loading', 'daily_beam_production']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_authenticated_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      t || '_authenticated_all', t
    );
  end loop;
end $$;

grant all on table public.beam_loading to anon, authenticated, service_role;
grant all on table public.daily_beam_production to anon, authenticated, service_role;
grant select on public.v_beam_remaining_report to anon, authenticated, service_role;
