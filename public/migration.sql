-- Jaisal FW Lite — initial schema, RLS, storage, seeds

create extension if not exists "pgcrypto";

-- roles
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  role_name text not null unique,
  is_custom boolean not null default false,
  created_at timestamptz not null default now()
);

-- users (id matches auth.users)
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role_id uuid not null references public.roles (id),
  pin_hash text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- workers
create table public.workers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  department text,
  is_active boolean not null default true
);

-- attendance
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

-- beam pipe stock
create table public.beam_pipe_stock (
  id uuid primary key default gen_random_uuid(),
  variety_name text not null,
  quantity_pcs integer not null default 0,
  updated_at timestamptz not null default now()
);

-- weft yarn stock
create table public.weft_yarn_stock (
  id uuid primary key default gen_random_uuid(),
  supplier text,
  colour_no text,
  colour_name text,
  stock_kg numeric not null default 0,
  updated_at timestamptz not null default now()
);

-- designs (conversion_charge generated)
create table public.designs (
  id uuid primary key default gen_random_uuid(),
  dno text not null,
  colour text,
  image_url text,
  warp_rate numeric not null default 0,
  weft_rate numeric not null default 0,
  selling_rate numeric not null default 0,
  conversion_charge numeric generated always as (
    selling_rate - ((warp_rate + weft_rate) * 0.08)
  ) stored,
  created_at timestamptz not null default now()
);

-- approval queue
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

-- RLS: authenticated only
alter table public.roles enable row level security;
alter table public.users enable row level security;
alter table public.workers enable row level security;
alter table public.attendance enable row level security;
alter table public.beam_pipe_stock enable row level security;
alter table public.weft_yarn_stock enable row level security;
alter table public.designs enable row level security;
alter table public.approval_queue enable row level security;

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

create policy "approval_queue_authenticated_all"
  on public.approval_queue for all to authenticated
  using (true) with check (true);

-- Storage bucket: design-images (public read, authenticated write)
insert into storage.buckets (id, name, public)
values ('design-images', 'design-images', true)
on conflict (id) do nothing;

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

-- Seed default roles
insert into public.roles (role_name, is_custom) values
  ('CEO', false),
  ('Programmer', false),
  ('Security', false),
  ('Operator', false);

-- Seed default beam pipe varieties
insert into public.beam_pipe_stock (variety_name, quantity_pcs) values
  ('Black', 0),
  ('White', 0),
  ('Bright', 0),
  ('Roto', 0);
