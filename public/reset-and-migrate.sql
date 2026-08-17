-- Jaisal FW Lite — SAFE RESET then full schema
-- WARNING: This deletes public app tables listed below.
-- Only run if this Supabase project is for Jaisal FW Lite (or you are OK wiping these tables).

begin;

-- Drop in dependency order (ignore if missing)
drop table if exists public.approval_queue cascade;
drop table if exists public.attendance cascade;
drop table if exists public.design_warp cascade;
drop table if exists public.design_weft cascade;
drop table if exists public.designs cascade;
drop table if exists public.beam_pipe_stock cascade;
drop table if exists public.weft_yarn_stock cascade;
drop table if exists public.workers cascade;
drop table if exists public.users cascade;
drop table if exists public.roles cascade;

-- Remove old design-images storage policies if present
drop policy if exists "design_images_public_read" on storage.objects;
drop policy if exists "design_images_authenticated_insert" on storage.objects;
drop policy if exists "design_images_authenticated_update" on storage.objects;
drop policy if exists "design_images_authenticated_delete" on storage.objects;

commit;

-- ===== Full schema (same as migration) =====

create extension if not exists "pgcrypto";

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  role_name text not null unique,
  is_custom boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role_id uuid not null references public.roles (id),
  pin_hash text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.workers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  department text,
  is_active boolean not null default true
);

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.workers (id) on delete cascade,
  date date not null,
  in_time time,
  break_out time,
  break_in time,
  out_time time,
  status text,
  created_at timestamptz not null default now(),
  unique (worker_id, date)
);

create table public.beam_pipe_stock (
  id uuid primary key default gen_random_uuid(),
  variety_name text not null,
  quantity_pcs integer not null default 0,
  updated_at timestamptz not null default now()
);

create table public.weft_yarn_stock (
  id uuid primary key default gen_random_uuid(),
  supplier text,
  colour_no text,
  colour_name text,
  stock_kg numeric not null default 0,
  updated_at timestamptz not null default now()
);

create table public.designs (
  id uuid primary key default gen_random_uuid(),
  dno text not null,
  colour text,
  image_url text,
  design_date date not null default current_date,
  created_at timestamptz not null default now()
);

create table public.design_warp (
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

create table public.design_weft (
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

create table public.approval_queue (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid,
  action text not null,
  requested_by uuid references public.users (id),
  payload jsonb,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

alter table public.roles enable row level security;
alter table public.users enable row level security;
alter table public.workers enable row level security;
alter table public.attendance enable row level security;
alter table public.beam_pipe_stock enable row level security;
alter table public.weft_yarn_stock enable row level security;
alter table public.designs enable row level security;
alter table public.design_warp enable row level security;
alter table public.design_weft enable row level security;
alter table public.approval_queue enable row level security;

drop policy if exists "roles_authenticated_all" on public.roles;
drop policy if exists "users_authenticated_all" on public.users;
drop policy if exists "workers_authenticated_all" on public.workers;
drop policy if exists "attendance_authenticated_all" on public.attendance;
drop policy if exists "beam_pipe_stock_authenticated_all" on public.beam_pipe_stock;
drop policy if exists "weft_yarn_stock_authenticated_all" on public.weft_yarn_stock;
drop policy if exists "designs_authenticated_all" on public.designs;
drop policy if exists "design_warp_authenticated_all" on public.design_warp;
drop policy if exists "design_weft_authenticated_all" on public.design_weft;
drop policy if exists "approval_queue_authenticated_all" on public.approval_queue;

create policy "roles_authenticated_all"
  on public.roles for all to authenticated
  using (true) with check (true);

create policy "users_authenticated_all"
  on public.users for all to authenticated
  using (true) with check (true);

create policy "workers_authenticated_all"
  on public.workers for all to authenticated
  using (true) with check (true);

create policy "attendance_authenticated_all"
  on public.attendance for all to authenticated
  using (true) with check (true);

create policy "beam_pipe_stock_authenticated_all"
  on public.beam_pipe_stock for all to authenticated
  using (true) with check (true);

create policy "weft_yarn_stock_authenticated_all"
  on public.weft_yarn_stock for all to authenticated
  using (true) with check (true);

create policy "designs_authenticated_all"
  on public.designs for all to authenticated
  using (true) with check (true);

create policy "design_warp_authenticated_all"
  on public.design_warp for all to authenticated
  using (true) with check (true);

create policy "design_weft_authenticated_all"
  on public.design_weft for all to authenticated
  using (true) with check (true);

create policy "approval_queue_authenticated_all"
  on public.approval_queue for all to authenticated
  using (true) with check (true);

insert into storage.buckets (id, name, public)
values ('design-images', 'design-images', true)
on conflict (id) do nothing;

drop policy if exists "design_images_public_read" on storage.objects;
drop policy if exists "design_images_authenticated_insert" on storage.objects;
drop policy if exists "design_images_authenticated_update" on storage.objects;
drop policy if exists "design_images_authenticated_delete" on storage.objects;

create policy "design_images_public_read"
  on storage.objects for select
  using (bucket_id = 'design-images');

create policy "design_images_authenticated_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'design-images');

create policy "design_images_authenticated_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'design-images')
  with check (bucket_id = 'design-images');

create policy "design_images_authenticated_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'design-images');

insert into public.roles (role_name, is_custom) values
  ('CEO', false),
  ('Programmer', false),
  ('Security', false),
  ('Operator', false);

insert into public.beam_pipe_stock (variety_name, quantity_pcs) values
  ('Black', 0),
  ('White', 0),
  ('Bright', 0),
  ('Roto', 0);
