-- Design Master structured costing (replace flat warp/weft/selling rates)

-- Drop old generated column first (depends on flat rate fields)
alter table public.designs drop column if exists conversion_charge;
alter table public.designs drop column if exists warp_rate;
alter table public.designs drop column if exists weft_rate;
alter table public.designs drop column if exists selling_rate;

-- Optional design date for the costing header (defaults to today)
alter table public.designs
  add column if not exists design_date date not null default current_date;

create table if not exists public.design_warp (
  id uuid primary key default gen_random_uuid(),
  design_id uuid not null references public.designs (id) on delete cascade,
  item_colour text,
  denier numeric,
  tar numeric,
  length numeric,
  rate numeric,
  weight_kg numeric generated always as (denier * tar * length / 9000000.0) stored,
  amount numeric generated always as ((denier * tar * length / 9000000.0) * rate) stored,
  conversion_rate numeric,
  created_at timestamptz not null default now()
);

create table if not exists public.design_weft (
  id uuid primary key default gen_random_uuid(),
  design_id uuid not null references public.designs (id) on delete cascade,
  item_colour text,
  denier numeric,
  pic numeric,
  width numeric,
  length numeric,
  rate numeric,
  weight_kg numeric generated always as (denier * pic * width * length / 9000000.0) stored,
  amount numeric generated always as ((denier * pic * width * length / 9000000.0) * rate) stored,
  conversion_rate numeric,
  created_at timestamptz not null default now()
);

create index if not exists design_weft_item_colour_created_idx
  on public.design_weft (lower(item_colour), created_at desc);

alter table public.design_warp enable row level security;
alter table public.design_weft enable row level security;

drop policy if exists "design_warp_authenticated_all" on public.design_warp;
create policy "design_warp_authenticated_all"
  on public.design_warp for all to authenticated
  using (true) with check (true);

drop policy if exists "design_weft_authenticated_all" on public.design_weft;
create policy "design_weft_authenticated_all"
  on public.design_weft for all to authenticated
  using (true) with check (true);

grant all on table public.design_warp to anon, authenticated, service_role;
grant all on table public.design_weft to anon, authenticated, service_role;
