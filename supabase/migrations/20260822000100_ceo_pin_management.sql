-- CEO PIN Management + Module PINs + Advance Salary (additive only)

-- ---------- Departments (PIN management master) ----------
create table if not exists public.pin_departments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists pin_departments_name_unique
  on public.pin_departments (lower(trim(name)));

-- ---------- Module PINs (sidebar modules — separate from role login PINs) ----------
create table if not exists public.module_pins (
  id uuid primary key default gen_random_uuid(),
  module_key text not null unique,
  module_name text not null,
  department_id uuid references public.pin_departments (id) on delete set null,
  pin_hash text not null,
  pin_display text not null,
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists module_pins_department_idx on public.module_pins (department_id);

-- ---------- CEO PIN (isolated from module PINs) ----------
create table if not exists public.ceo_pin_settings (
  id uuid primary key default gen_random_uuid(),
  pin_hash text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users (id) on delete set null,
  constraint ceo_pin_settings_singleton check (id = id)
);

-- ---------- PIN department users + module access ----------
create table if not exists public.pin_department_users (
  id uuid primary key default gen_random_uuid(),
  department_id uuid references public.pin_departments (id) on delete set null,
  worker_id uuid references public.workers (id) on delete set null,
  full_name text not null,
  email text,
  mobile text,
  designation text,
  custom_designation text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pin_user_module_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.pin_department_users (id) on delete cascade,
  module_key text not null,
  can_access boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, module_key)
);

-- ---------- Extended PIN audit (no plaintext CEO PIN) ----------
create table if not exists public.pin_management_audit (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  module_key text,
  module_name text,
  department_name text,
  target_user text,
  reference text,
  performed_by uuid references public.users (id) on delete set null,
  performed_by_name text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists pin_management_audit_created_idx
  on public.pin_management_audit (created_at desc);

-- ---------- Salary advance transactions (never overwrite — append only) ----------
create table if not exists public.salary_advance_transactions (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.workers (id) on delete cascade,
  advance_date date not null default current_date,
  amount numeric not null check (amount > 0),
  payment_mode text not null,
  reference_no text,
  bank_name text,
  remarks text,
  is_voided boolean not null default false,
  void_reason text,
  created_by uuid references public.users (id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint salary_advance_payment_mode_check
    check (payment_mode in ('Cash', 'Cheque', 'Bank Transfer'))
);

create index if not exists salary_advance_worker_date_idx
  on public.salary_advance_transactions (worker_id, advance_date desc);

create index if not exists salary_advance_date_idx
  on public.salary_advance_transactions (advance_date desc);

-- ---------- Seed departments ----------
insert into public.pin_departments (name, code)
select v.name, v.code
from (
  values
    ('Admin', 'ADM'),
    ('Design', 'DSN'),
    ('Production', 'PRD'),
    ('Warping', 'WRP'),
    ('Store', 'STR'),
    ('HR', 'HR'),
    ('Maintenance', 'MNT'),
    ('Sales', 'SLS'),
    ('Security', 'SEC'),
    ('Accounts', 'ACC'),
    ('Quality', 'QTY'),
    ('Dispatch', 'DSP')
) as v(name, code)
where not exists (
  select 1 from public.pin_departments d where lower(trim(d.name)) = lower(trim(v.name))
);

-- ---------- RLS ----------
alter table public.pin_departments enable row level security;
alter table public.module_pins enable row level security;
alter table public.ceo_pin_settings enable row level security;
alter table public.pin_department_users enable row level security;
alter table public.pin_user_module_access enable row level security;
alter table public.pin_management_audit enable row level security;
alter table public.salary_advance_transactions enable row level security;

drop policy if exists pin_departments_authenticated_all on public.pin_departments;
create policy pin_departments_authenticated_all
  on public.pin_departments for all to authenticated
  using (true) with check (true);

-- module_pins: authenticated read metadata only (no pin columns via view pattern — client uses edge function for secrets)
drop policy if exists module_pins_authenticated_all on public.module_pins;
create policy module_pins_authenticated_all
  on public.module_pins for all to authenticated
  using (true) with check (true);

drop policy if exists ceo_pin_settings_deny_client on public.ceo_pin_settings;
create policy ceo_pin_settings_deny_client
  on public.ceo_pin_settings for all to authenticated
  using (false) with check (false);

drop policy if exists pin_department_users_authenticated_all on public.pin_department_users;
create policy pin_department_users_authenticated_all
  on public.pin_department_users for all to authenticated
  using (true) with check (true);

drop policy if exists pin_user_module_access_authenticated_all on public.pin_user_module_access;
create policy pin_user_module_access_authenticated_all
  on public.pin_user_module_access for all to authenticated
  using (true) with check (true);

drop policy if exists pin_management_audit_authenticated_all on public.pin_management_audit;
create policy pin_management_audit_authenticated_all
  on public.pin_management_audit for all to authenticated
  using (true) with check (true);

drop policy if exists salary_advance_authenticated_all on public.salary_advance_transactions;
create policy salary_advance_authenticated_all
  on public.salary_advance_transactions for all to authenticated
  using (true) with check (true);

grant all on table public.pin_departments to anon, authenticated, service_role;
grant all on table public.module_pins to anon, authenticated, service_role;
grant all on table public.ceo_pin_settings to anon, authenticated, service_role;
grant all on table public.pin_department_users to anon, authenticated, service_role;
grant all on table public.pin_user_module_access to anon, authenticated, service_role;
grant all on table public.pin_management_audit to anon, authenticated, service_role;
grant all on table public.salary_advance_transactions to anon, authenticated, service_role;
