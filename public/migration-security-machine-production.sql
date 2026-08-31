-- Mirror of supabase/migrations/20260831120000_security_machine_production_update.sql
-- Apply in Supabase SQL editor if CLI migration is unavailable.

create table if not exists public.security_operators (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  name_key text not null,
  is_active boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint security_operators_name_key_unique unique (name_key)
);

create index if not exists security_operators_active_idx
  on public.security_operators (is_active, full_name);

create table if not exists public.security_shift_submissions (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null default current_date,
  shift text not null,
  status text not null default 'submitted',
  total_production numeric not null default 0,
  running_count int not null default 0,
  stopped_count int not null default 0,
  submitted_by text,
  submitted_by_user_id uuid,
  submitted_at timestamptz not null default now(),
  whatsapp_sent boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists security_shift_submissions_date_idx
  on public.security_shift_submissions (entry_date desc, shift, submitted_at desc);

create unique index if not exists security_shift_submissions_date_shift_unique
  on public.security_shift_submissions (entry_date, shift)
  where status = 'submitted';

create table if not exists public.security_shift_machines (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.security_shift_submissions (id) on delete cascade,
  machine_no text not null,
  is_running boolean not null default true,
  stop_reason text,
  operator_name text,
  production_meters numeric not null default 0,
  production_entry_id uuid references public.production_entries (id) on delete set null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint security_shift_machines_submission_machine_unique unique (submission_id, machine_no)
);

create index if not exists security_shift_machines_submission_idx
  on public.security_shift_machines (submission_id, sort_order);
create index if not exists security_shift_machines_machine_idx
  on public.security_shift_machines (machine_no);

alter table public.production_entries
  add column if not exists source text;

alter table public.security_operators enable row level security;
alter table public.security_shift_submissions enable row level security;
alter table public.security_shift_machines enable row level security;

drop policy if exists security_operators_all on public.security_operators;
create policy security_operators_all on public.security_operators
  for all to authenticated using (true) with check (true);

drop policy if exists security_shift_submissions_all on public.security_shift_submissions;
create policy security_shift_submissions_all on public.security_shift_submissions
  for all to authenticated using (true) with check (true);

drop policy if exists security_shift_machines_all on public.security_shift_machines;
create policy security_shift_machines_all on public.security_shift_machines
  for all to authenticated using (true) with check (true);

drop policy if exists security_operators_anon on public.security_operators;
create policy security_operators_anon on public.security_operators
  for all to anon using (true) with check (true);

drop policy if exists security_shift_submissions_anon on public.security_shift_submissions;
create policy security_shift_submissions_anon on public.security_shift_submissions
  for all to anon using (true) with check (true);

drop policy if exists security_shift_machines_anon on public.security_shift_machines;
create policy security_shift_machines_anon on public.security_shift_machines
  for all to anon using (true) with check (true);

grant select, insert, update, delete on public.security_operators to authenticated, anon;
grant select, insert, update, delete on public.security_shift_submissions to authenticated, anon;
grant select, insert, update, delete on public.security_shift_machines to authenticated, anon;
