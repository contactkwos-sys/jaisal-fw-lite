-- Rate Master — date-wise warp/weft yarn rates for Design-wise Costing
-- Additive only; does not modify existing costing tables except optional audit columns.

create table if not exists public.rate_master_config (
  id text primary key default 'default',
  default_gst_percent numeric not null default 5,
  default_freight_per_kg numeric not null default 2.25,
  updated_by uuid references auth.users(id),
  updated_at timestamptz default now()
);

insert into public.rate_master_config (id, default_gst_percent, default_freight_per_kg)
values ('default', 5, 2.25)
on conflict (id) do nothing;

create table if not exists public.rate_master (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('warp', 'weft')),
  item_name text not null,
  denier text,
  supplier_name text,
  basic_rate numeric not null default 0 check (basic_rate >= 0),
  gst_percent numeric not null default 5 check (gst_percent >= 0),
  gst_amount numeric not null default 0,
  freight_per_kg numeric not null default 2.25 check (freight_per_kg >= 0),
  effective_rate numeric not null default 0,
  effective_from date not null default current_date,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_rate_master_lookup
  on public.rate_master (category, lower(item_name), effective_from desc)
  where is_active = true;

create index if not exists idx_rate_master_effective
  on public.rate_master (effective_from desc);

alter table public.design_costing_warp
  add column if not exists rate_source text,
  add column if not exists rate_master_id uuid references public.rate_master(id);

alter table public.design_costing_weft
  add column if not exists rate_source text,
  add column if not exists rate_master_id uuid references public.rate_master(id);

alter table public.rate_master_config enable row level security;
alter table public.rate_master enable row level security;

drop policy if exists rate_master_config_authenticated_all on public.rate_master_config;
create policy rate_master_config_authenticated_all
  on public.rate_master_config for all to authenticated using (true) with check (true);

drop policy if exists rate_master_authenticated_all on public.rate_master;
create policy rate_master_authenticated_all
  on public.rate_master for all to authenticated using (true) with check (true);

grant all on table public.rate_master_config to anon, authenticated, service_role;
grant all on table public.rate_master to anon, authenticated, service_role;

do $$
begin
  if not exists (select 1 from public.rate_master limit 1) then
    insert into public.rate_master (category, item_name, denier, supplier_name, basic_rate, gst_percent, gst_amount, freight_per_kg, effective_rate, effective_from)
    values
      ('warp', '80 Roto Black', '80', null, 0, 5, 0, 2.25, 2.25, current_date),
      ('warp', '150 Roto Black & White', '150', null, 0, 5, 0, 2.25, 2.25, current_date),
      ('warp', '150 Bright Yarn', '150', null, 0, 5, 0, 2.25, 2.25, current_date),
      ('warp', 'Others (Warp)', null, null, 0, 5, 0, 2.25, 2.25, current_date),
      ('weft', '440 HSY', 'Same', null, 0, 5, 0, 2.25, 2.25, current_date),
      ('weft', '550 HSY', 'Same', null, 0, 5, 0, 2.25, 2.25, current_date),
      ('weft', '660 HSY', 'Same', null, 0, 5, 0, 2.25, 2.25, current_date),
      ('weft', '300 Tex', '310', 'Santosh Zari', 195, 5, 9.75, 2.25, 207.00, current_date),
      ('weft', '300 NSY', null, null, 0, 5, 0, 2.25, 2.25, current_date),
      ('weft', 'Others (Weft)', null, null, 0, 5, 0, 2.25, 2.25, current_date);
  end if;
end $$;
