-- Final batch: DIN costing extension, Sample Program Cards, Photo Catalogue, Sales Tracker
-- Verified live FKs: designs(id), design_costing(id)
-- Mirror: public/migration-sample-sales-catalogue-costing.sql

-- ---------------------------------------------------------------------------
-- PART A — Extend design_costing + designs (verified existing columns first)
-- Live designs: id, dno, colour, image_url, design_date, cost_per_meter, matching_cost, total_cost
-- Live design_costing: din_number, conversion_charge, mu_percent, gst_percent, final_cost_per_mtr, …
-- ---------------------------------------------------------------------------
alter table public.design_costing
  add column if not exists rate_per_meter numeric,
  add column if not exists sell_rate numeric,
  add column if not exists difference numeric,
  add column if not exists wastage_amount numeric,
  add column if not exists formula_cost_per_mtr numeric,
  add column if not exists gst_enabled boolean not null default true;

alter table public.designs
  add column if not exists rate_per_meter numeric,
  add column if not exists sell_rate numeric,
  add column if not exists gst_percent numeric default 5;

insert into public.app_settings (key, value)
values ('design_rate_per_meter', '0')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- PART B — Sample Program Cards (FK → designs.id verified)
-- ---------------------------------------------------------------------------
create table if not exists public.sample_program_cards (
  id uuid primary key default gen_random_uuid(),
  design_id uuid references public.designs (id) on delete set null,
  din_number text,
  cost_per_meter numeric,
  sell_rate numeric,
  warp_colour text,
  weft_colour text,
  colour_number text,
  colour_name text,
  supplier text,
  pic_counts jsonb not null default '{}'::jsonb,
  job_card_ref text,
  machine_no text,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists idx_sample_program_cards_design
  on public.sample_program_cards (design_id);
create index if not exists idx_sample_program_cards_created
  on public.sample_program_cards (created_at desc);

alter table public.sample_program_cards enable row level security;

drop policy if exists sample_program_cards_all on public.sample_program_cards;
create policy sample_program_cards_all
  on public.sample_program_cards for all to authenticated
  using (true) with check (true);

grant select, insert, update, delete on table public.sample_program_cards to authenticated;
grant all on table public.sample_program_cards to service_role;

-- ---------------------------------------------------------------------------
-- PART C — Photo Catalogue
-- ---------------------------------------------------------------------------
create table if not exists public.photo_catalogue (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in (
    'Cotton Catalogue', 'Garment Catalogue', 'Design Catalogue'
  )),
  image_url text not null,
  thumbnail_url text,
  design_number text,
  colour text,
  tags text[],
  uploaded_by text,
  created_at timestamptz not null default now()
);

create index if not exists idx_photo_catalogue_category
  on public.photo_catalogue (category, created_at desc);
create index if not exists idx_photo_catalogue_created
  on public.photo_catalogue (created_at desc);

alter table public.photo_catalogue enable row level security;

drop policy if exists photo_catalogue_all on public.photo_catalogue;
create policy photo_catalogue_all
  on public.photo_catalogue for all to authenticated
  using (true) with check (true);

grant select, insert, update, delete on table public.photo_catalogue to authenticated;
grant all on table public.photo_catalogue to service_role;

insert into storage.buckets (id, name, public)
values ('photo-catalogue', 'photo-catalogue', true)
on conflict (id) do nothing;

drop policy if exists photo_catalogue_public_read on storage.objects;
create policy photo_catalogue_public_read
  on storage.objects for select
  using (bucket_id = 'photo-catalogue');

drop policy if exists photo_catalogue_authenticated_insert on storage.objects;
create policy photo_catalogue_authenticated_insert
  on storage.objects for insert to authenticated
  with check (bucket_id = 'photo-catalogue');

drop policy if exists photo_catalogue_authenticated_update on storage.objects;
create policy photo_catalogue_authenticated_update
  on storage.objects for update to authenticated
  using (bucket_id = 'photo-catalogue') with check (bucket_id = 'photo-catalogue');

-- ---------------------------------------------------------------------------
-- PART D — Sales Tracker
-- ---------------------------------------------------------------------------
create table if not exists public.customer_visits (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  contact_number text,
  visit_date date not null default (timezone('utc', now())::date),
  next_visit_plan date,
  notes text,
  entered_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_customer_visits_date
  on public.customer_visits (visit_date desc);

alter table public.customer_visits enable row level security;

drop policy if exists customer_visits_all on public.customer_visits;
create policy customer_visits_all
  on public.customer_visits for all to authenticated
  using (true) with check (true);

grant select, insert, update, delete on table public.customer_visits to authenticated;
grant all on table public.customer_visits to service_role;

create table if not exists public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  item_type text not null check (item_type in (
    'Garment',
    'Curtain Jute Panel',
    'Curtain Bright',
    'Curtain Allover Basic',
    'Curtain Allover Premium',
    'Other'
  )),
  quantity_rolls numeric not null default 0,
  colour_option text,
  order_date date not null default (timezone('utc', now())::date),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'dispatched')),
  linked_sample_card_id uuid references public.sample_program_cards (id) on delete set null,
  catalogue_photo_id uuid references public.photo_catalogue (id) on delete set null,
  catalogue_photo_url text,
  entered_by text,
  created_at timestamptz not null default now()
);

create index if not exists idx_sales_orders_date
  on public.sales_orders (order_date desc);
create index if not exists idx_sales_orders_status
  on public.sales_orders (status);

alter table public.sales_orders enable row level security;

drop policy if exists sales_orders_all on public.sales_orders;
create policy sales_orders_all
  on public.sales_orders for all to authenticated
  using (true) with check (true);

grant select, insert, update, delete on table public.sales_orders to authenticated;
grant all on table public.sales_orders to service_role;
