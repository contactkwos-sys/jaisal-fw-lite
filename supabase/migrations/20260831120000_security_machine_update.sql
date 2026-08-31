-- Security Machine & Production Update
-- Simple gate entry for Security role → syncs to production_entries + dashboard.

create table if not exists public.security_operators (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint security_operators_name_unique unique (full_name)
);

create index if not exists security_operators_active_idx
  on public.security_operators (is_active, full_name);

create table if not exists public.security_machine_updates (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null default current_date,
  shift text not null check (shift in ('Day', 'Night')),
  reported_at timestamptz not null default now(),
  submitted_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  total_production_mtr numeric not null default 0,
  created_by uuid,
  created_by_name text,
  whatsapp_sent boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists security_machine_updates_date_shift_idx
  on public.security_machine_updates (entry_date desc, shift, status);

create table if not exists public.security_machine_update_lines (
  id uuid primary key default gen_random_uuid(),
  update_id uuid not null references public.security_machine_updates (id) on delete cascade,
  machine_no text not null,
  is_running boolean not null default true,
  stop_reason text,
  operator_name text,
  production_mtr numeric not null default 0,
  production_entry_id uuid references public.production_entries (id) on delete set null,
  sr_no integer not null default 1,
  created_at timestamptz not null default now(),
  constraint security_machine_update_lines_machine_unique unique (update_id, machine_no),
  constraint security_machine_update_lines_stop_reason_chk
    check (
      stop_reason is null
      or stop_reason in ('Electronic Fault', 'Mechanical Fault', 'Operator Problem')
    )
);

create index if not exists security_machine_update_lines_update_idx
  on public.security_machine_update_lines (update_id, sr_no);

alter table public.security_operators enable row level security;
alter table public.security_machine_updates enable row level security;
alter table public.security_machine_update_lines enable row level security;

drop policy if exists security_operators_authenticated_all on public.security_operators;
create policy security_operators_authenticated_all
  on public.security_operators for all to authenticated
  using (true) with check (true);

drop policy if exists security_machine_updates_authenticated_all on public.security_machine_updates;
create policy security_machine_updates_authenticated_all
  on public.security_machine_updates for all to authenticated
  using (true) with check (true);

drop policy if exists security_machine_update_lines_authenticated_all on public.security_machine_update_lines;
create policy security_machine_update_lines_authenticated_all
  on public.security_machine_update_lines for all to authenticated
  using (true) with check (true);

grant select, insert, update, delete on public.security_operators to authenticated, anon, service_role;
grant select, insert, update, delete on public.security_machine_updates to authenticated, anon, service_role;
grant select, insert, update, delete on public.security_machine_update_lines to authenticated, anon, service_role;

-- Seed common operators if empty (idempotent)
insert into public.security_operators (full_name)
select n from (values ('Ramesh'), ('Suresh'), ('Amit')) as v(n)
where not exists (select 1 from public.security_operators limit 1)
on conflict (full_name) do nothing;
