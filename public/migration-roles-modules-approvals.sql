-- Roles (Manager + 4 new), pending_approvals, and new modules (B–H)
-- Mirror: public/migration-roles-modules-approvals.sql

-- ---------------------------------------------------------------------------
-- PART A — Roles
-- ---------------------------------------------------------------------------
insert into public.roles (role_name, is_custom) values
  ('Manager', false),
  ('Machine Supervisor', false),
  ('Salesman', false),
  ('Checker & Dispatch', false),
  ('Program Supervisor', false)
on conflict (role_name) do nothing;

-- ---------------------------------------------------------------------------
-- PART A — pending_approvals (7-day edit/delete queue for CEO)
-- ---------------------------------------------------------------------------
create table if not exists public.pending_approvals (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid,
  action text not null check (action in ('edit', 'delete')),
  requested_by text not null,
  requested_at timestamptz not null default now(),
  new_data jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  resolved_by text,
  resolved_at timestamptz
);

create index if not exists idx_pending_approvals_status
  on public.pending_approvals (status, requested_at desc);
create index if not exists idx_pending_approvals_table_record
  on public.pending_approvals (table_name, record_id);

alter table public.pending_approvals enable row level security;

drop policy if exists pending_approvals_select on public.pending_approvals;
create policy pending_approvals_select
  on public.pending_approvals for select to authenticated using (true);

drop policy if exists pending_approvals_insert on public.pending_approvals;
create policy pending_approvals_insert
  on public.pending_approvals for insert to authenticated with check (true);

drop policy if exists pending_approvals_update on public.pending_approvals;
create policy pending_approvals_update
  on public.pending_approvals for update to authenticated using (true) with check (true);

grant select, insert, update on table public.pending_approvals to authenticated;
grant all on table public.pending_approvals to service_role;

-- Cash Book: allow Manager edit/delete within 7-day window at app layer
-- (old records go to pending_approvals; CEO applies after approve)
drop policy if exists cashbook_entries_update on public.cashbook_entries;
create policy cashbook_entries_update
  on public.cashbook_entries
  for update to authenticated
  using (true) with check (true);

drop policy if exists cashbook_entries_delete on public.cashbook_entries;
create policy cashbook_entries_delete
  on public.cashbook_entries
  for delete to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- PART C — Warp Beam Pipe Tracking
-- ---------------------------------------------------------------------------
create table if not exists public.warp_beam_pipe (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null default (timezone('utc', now())::date),
  jobber_name text not null,
  gp_number text,
  beam_number text,
  total_ends numeric,
  yarn_count_denier text,
  weight_kg numeric,
  pipe_out_qty numeric not null default 0,
  pipe_in_qty numeric not null default 0,
  rate numeric,
  remarks text,
  status text not null default 'out' check (status in ('out', 'returned')),
  entered_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_warp_beam_pipe_status on public.warp_beam_pipe (status);
create index if not exists idx_warp_beam_pipe_entry_date on public.warp_beam_pipe (entry_date desc);

alter table public.warp_beam_pipe enable row level security;

drop policy if exists warp_beam_pipe_all on public.warp_beam_pipe;
create policy warp_beam_pipe_all
  on public.warp_beam_pipe for all to authenticated
  using (true) with check (true);

grant select, insert, update, delete on table public.warp_beam_pipe to authenticated;
grant all on table public.warp_beam_pipe to service_role;

-- ---------------------------------------------------------------------------
-- PART D — Yarn Inward (OCR)
-- ---------------------------------------------------------------------------
create table if not exists public.yarn_inward (
  id uuid primary key default gen_random_uuid(),
  yarn_type text not null check (yarn_type in ('warp', 'weft')),
  supplier_name text not null,
  item text,
  qty numeric,
  amount numeric,
  invoice_image_url text,
  entry_date date not null default (timezone('utc', now())::date),
  entered_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_yarn_inward_entry_date on public.yarn_inward (entry_date desc);
create index if not exists idx_yarn_inward_yarn_type on public.yarn_inward (yarn_type);

alter table public.yarn_inward enable row level security;

drop policy if exists yarn_inward_all on public.yarn_inward;
create policy yarn_inward_all
  on public.yarn_inward for all to authenticated
  using (true) with check (true);

grant select, insert, update, delete on table public.yarn_inward to authenticated;
grant all on table public.yarn_inward to service_role;

-- Invoice images bucket (OCR captures)
insert into storage.buckets (id, name, public)
values ('invoice-images', 'invoice-images', true)
on conflict (id) do nothing;

drop policy if exists invoice_images_public_read on storage.objects;
create policy invoice_images_public_read
  on storage.objects for select
  using (bucket_id = 'invoice-images');

drop policy if exists invoice_images_authenticated_insert on storage.objects;
create policy invoice_images_authenticated_insert
  on storage.objects for insert to authenticated
  with check (bucket_id = 'invoice-images');

drop policy if exists invoice_images_authenticated_update on storage.objects;
create policy invoice_images_authenticated_update
  on storage.objects for update to authenticated
  using (bucket_id = 'invoice-images') with check (bucket_id = 'invoice-images');

-- ---------------------------------------------------------------------------
-- PART E — Maintenance Material + Auto Gate Pass
-- ---------------------------------------------------------------------------
create table if not exists public.maintenance_material (
  id uuid primary key default gen_random_uuid(),
  direction text not null check (direction in ('out', 'in')),
  material_name text not null,
  purpose text,
  sent_to text,
  entry_date date not null default (timezone('utc', now())::date),
  entered_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_maintenance_material_entry_date
  on public.maintenance_material (entry_date desc);

alter table public.maintenance_material enable row level security;

drop policy if exists maintenance_material_all on public.maintenance_material;
create policy maintenance_material_all
  on public.maintenance_material for all to authenticated
  using (true) with check (true);

grant select, insert, update, delete on table public.maintenance_material to authenticated;
grant all on table public.maintenance_material to service_role;

create sequence if not exists public.gate_pass_gp_seq start 1 increment 1;

create table if not exists public.gate_pass (
  id uuid primary key default gen_random_uuid(),
  ref_type text not null default 'maintenance',
  ref_id uuid,
  gp_number text not null unique,
  generated_at timestamptz not null default now()
);

create index if not exists idx_gate_pass_ref on public.gate_pass (ref_type, ref_id);

alter table public.gate_pass enable row level security;

drop policy if exists gate_pass_all on public.gate_pass;
create policy gate_pass_all
  on public.gate_pass for all to authenticated
  using (true) with check (true);

grant select, insert, update, delete on table public.gate_pass to authenticated;
grant all on table public.gate_pass to service_role;
grant usage, select on sequence public.gate_pass_gp_seq to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- PART F — Loan Tracker
-- ---------------------------------------------------------------------------
create table if not exists public.loan_entries (
  id uuid primary key default gen_random_uuid(),
  party_name text not null,
  direction text not null check (direction in ('given', 'received')),
  amount numeric(14, 2) not null check (amount > 0),
  purpose text,
  entry_date date not null default (timezone('utc', now())::date),
  entered_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_loan_entries_party on public.loan_entries (lower(party_name));
create index if not exists idx_loan_entries_entry_date on public.loan_entries (entry_date desc);

alter table public.loan_entries enable row level security;

drop policy if exists loan_entries_all on public.loan_entries;
create policy loan_entries_all
  on public.loan_entries for all to authenticated
  using (true) with check (true);

grant select, insert, update, delete on table public.loan_entries to authenticated;
grant all on table public.loan_entries to service_role;

-- ---------------------------------------------------------------------------
-- PART G — GEB Electricity Reading
-- ---------------------------------------------------------------------------
create table if not exists public.geb_readings (
  id uuid primary key default gen_random_uuid(),
  reading_date date not null default (timezone('utc', now())::date),
  meter_reading numeric not null,
  previous_reading numeric not null default 0,
  unit_consumed numeric not null default 0,
  rate_per_unit numeric not null default 8.50,
  amount numeric not null default 0,
  entered_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_geb_readings_date on public.geb_readings (reading_date desc);

alter table public.geb_readings enable row level security;

drop policy if exists geb_readings_all on public.geb_readings;
create policy geb_readings_all
  on public.geb_readings for all to authenticated
  using (true) with check (true);

grant select, insert, update, delete on table public.geb_readings to authenticated;
grant all on table public.geb_readings to service_role;

-- ---------------------------------------------------------------------------
-- PART H — Orders & Order Pending
-- ---------------------------------------------------------------------------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_type text not null check (order_type in (
    'Maintenance Material', 'Warp Yarn', 'Weft Yarn', 'Repair Call', 'Other'
  )),
  detail text,
  raised_by text not null,
  order_date date not null default (timezone('utc', now())::date),
  status text not null default 'pending' check (status in ('pending', 'done')),
  created_at timestamptz not null default now()
);

create index if not exists idx_orders_status on public.orders (status, order_date desc);

alter table public.orders enable row level security;

drop policy if exists orders_all on public.orders;
create policy orders_all
  on public.orders for all to authenticated
  using (true) with check (true);

grant select, insert, update, delete on table public.orders to authenticated;
grant all on table public.orders to service_role;
