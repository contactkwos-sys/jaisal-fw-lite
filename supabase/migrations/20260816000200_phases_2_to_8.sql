-- Jaisal FW Lite — Phases 2–8 schema (additive; does not drop Phase 1 tables)

-- ---------- Phase 2: Purchase & Inward ----------
create table if not exists public.weft_purchases (
  id uuid primary key default gen_random_uuid(),
  quality text not null,
  weight_kg numeric not null default 0,
  rate numeric not null default 0,
  supplier text,
  input_mode text not null default 'manual',
  photo_url text,
  barcode text,
  created_at timestamptz not null default now()
);

create table if not exists public.beam_pipe_out (
  id uuid primary key default gen_random_uuid(),
  pipe_variety text not null,
  vendor_name text not null,
  date_out date not null default current_date,
  time_out time not null default localtime,
  status text not null default 'pending_return',
  created_at timestamptz not null default now()
);

create table if not exists public.beam_pipe_in (
  id uuid primary key default gen_random_uuid(),
  pipe_variety text not null,
  kg numeric not null default 0,
  tar_count integer not null default 0,
  meter numeric not null default 0,
  challan_no text,
  gst_no text,
  gst_amount numeric not null default 0,
  out_id uuid references public.beam_pipe_out (id),
  created_at timestamptz not null default now()
);

create table if not exists public.warp_yarn_inward (
  id uuid primary key default gen_random_uuid(),
  colour text not null,
  qty_kg numeric not null default 0,
  supplier text,
  gst_no text,
  invoice_no text,
  input_mode text not null default 'manual',
  photo_url text,
  created_at timestamptz not null default now()
);

-- filled flag for returned/filled pipes (additive on Phase 1 stock table)
alter table public.beam_pipe_stock
  add column if not exists is_filled boolean not null default false;

-- ---------- Phase 3: Production ----------
create table if not exists public.job_cards (
  id uuid primary key default gen_random_uuid(),
  dno text not null,
  machine_no text,
  operator_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.job_card_colours (
  id uuid primary key default gen_random_uuid(),
  job_card_id uuid not null references public.job_cards (id) on delete cascade,
  colour text,
  matching text,
  pick integer,
  program_meter numeric,
  fut_panel text
);

create table if not exists public.production_entries (
  id uuid primary key default gen_random_uuid(),
  machine_no text not null,
  entry_date date not null default current_date,
  shift text not null,
  operator_name text,
  working_hour numeric not null default 0,
  total_meter numeric not null default 0,
  shift_diff numeric generated always as (12 - working_hour) stored,
  efficiency_pct numeric generated always as ((working_hour / 12) * 100) stored,
  created_at timestamptz not null default now()
);

-- ---------- Phase 4: Maintenance ----------
create table if not exists public.maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  machine_no text not null,
  priority text not null default 'Med',
  problem text,
  item_needed text,
  photo_url text,
  assigned_to text,
  status text not null default 'open',
  cost numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.repairing_tracker (
  id uuid primary key default gen_random_uuid(),
  item_name text not null,
  for_what text not null,
  vendor text,
  gatepass_no text not null,
  date_out date not null default current_date,
  date_in date,
  status text not null default 'out',
  cost numeric not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- Phase 5: Dispatch ----------
create table if not exists public.folding_entries (
  id uuid primary key default gen_random_uuid(),
  dno text not null,
  meter_folded numeric not null default 0,
  rolls integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.challans (
  id uuid primary key default gen_random_uuid(),
  challan_no text not null unique,
  party text not null,
  meter numeric not null default 0,
  rolls integer not null default 0,
  rate numeric not null default 0,
  gst_pct numeric not null default 5,
  total numeric generated always as (meter * rate * (1 + gst_pct / 100)) stored,
  created_at timestamptz not null default now()
);

create table if not exists public.gatepass (
  id uuid primary key default gen_random_uuid(),
  challan_id uuid references public.challans (id),
  tempo_driver text,
  vehicle_no text,
  date date not null default current_date,
  gatepass_no text,
  driver_signed boolean not null default false,
  received_signed boolean not null default false,
  signed_by_driver text,
  signed_by_received text,
  created_at timestamptz not null default now()
);

-- ---------- Phase 6: Payroll ----------
create table if not exists public.payroll_rates (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.roles (id) on delete cascade,
  rate_per_day numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (role_id)
);

-- workers may map to a role for payroll (assumed: department holds role name OR role_id column)
alter table public.workers
  add column if not exists role_id uuid references public.roles (id);

-- ---------- Phase 8: Electricity ----------
create table if not exists public.electricity_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null default current_date,
  source text not null default 'DGVCL Meter',
  unit_kwh numeric not null default 0,
  rate_per_unit numeric not null default 0,
  total numeric generated always as (unit_kwh * rate_per_unit) stored,
  created_at timestamptz not null default now()
);

-- RLS
alter table public.weft_purchases enable row level security;
alter table public.beam_pipe_out enable row level security;
alter table public.beam_pipe_in enable row level security;
alter table public.warp_yarn_inward enable row level security;
alter table public.job_cards enable row level security;
alter table public.job_card_colours enable row level security;
alter table public.production_entries enable row level security;
alter table public.maintenance_requests enable row level security;
alter table public.repairing_tracker enable row level security;
alter table public.folding_entries enable row level security;
alter table public.challans enable row level security;
alter table public.gatepass enable row level security;
alter table public.payroll_rates enable row level security;
alter table public.electricity_entries enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'weft_purchases','beam_pipe_out','beam_pipe_in','warp_yarn_inward',
    'job_cards','job_card_colours','production_entries',
    'maintenance_requests','repairing_tracker',
    'folding_entries','challans','gatepass',
    'payroll_rates','electricity_entries'
  ]
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      t || '_authenticated_all', t
    );
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      t || '_authenticated_all', t
    );
  end loop;
end $$;

-- Grants for API roles
grant all on table public.weft_purchases to anon, authenticated, service_role;
grant all on table public.beam_pipe_out to anon, authenticated, service_role;
grant all on table public.beam_pipe_in to anon, authenticated, service_role;
grant all on table public.warp_yarn_inward to anon, authenticated, service_role;
grant all on table public.job_cards to anon, authenticated, service_role;
grant all on table public.job_card_colours to anon, authenticated, service_role;
grant all on table public.production_entries to anon, authenticated, service_role;
grant all on table public.maintenance_requests to anon, authenticated, service_role;
grant all on table public.repairing_tracker to anon, authenticated, service_role;
grant all on table public.folding_entries to anon, authenticated, service_role;
grant all on table public.challans to anon, authenticated, service_role;
grant all on table public.gatepass to anon, authenticated, service_role;
grant all on table public.payroll_rates to anon, authenticated, service_role;
grant all on table public.electricity_entries to anon, authenticated, service_role;

-- Storage for purchase/maintenance photos
insert into storage.buckets (id, name, public)
values ('factory-uploads', 'factory-uploads', true)
on conflict (id) do nothing;

drop policy if exists factory_uploads_public_read on storage.objects;
create policy factory_uploads_public_read
  on storage.objects for select
  using (bucket_id = 'factory-uploads');

drop policy if exists factory_uploads_authenticated_insert on storage.objects;
create policy factory_uploads_authenticated_insert
  on storage.objects for insert to authenticated
  with check (bucket_id = 'factory-uploads');

drop policy if exists factory_uploads_authenticated_update on storage.objects;
create policy factory_uploads_authenticated_update
  on storage.objects for update to authenticated
  using (bucket_id = 'factory-uploads')
  with check (bucket_id = 'factory-uploads');

drop policy if exists factory_uploads_authenticated_delete on storage.objects;
create policy factory_uploads_authenticated_delete
  on storage.objects for delete to authenticated
  using (bucket_id = 'factory-uploads');
