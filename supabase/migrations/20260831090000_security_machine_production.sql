-- Security Machine & Production Update
-- Simple gate screen for Security role → ERP dashboard sync

create table if not exists public.security_operators (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint security_operators_name_unique unique (name)
);

create index if not exists security_operators_active_idx
  on public.security_operators (is_active, name);

create table if not exists public.security_machine_updates (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null default current_date,
  shift text not null check (shift in ('Day', 'Night')),
  total_production numeric not null default 0,
  running_count int not null default 0,
  stopped_count int not null default 0,
  status text not null default 'submitted',
  whatsapp_channel text,
  submitted_by uuid references auth.users (id) on delete set null,
  submitted_by_name text,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint security_machine_updates_date_shift_unique unique (entry_date, shift)
);

create index if not exists security_machine_updates_date_idx
  on public.security_machine_updates (entry_date desc, shift);

create table if not exists public.security_machine_update_lines (
  id uuid primary key default gen_random_uuid(),
  update_id uuid not null references public.security_machine_updates (id) on delete cascade,
  machine_no text not null,
  run_status text not null check (run_status in ('Running', 'Stopped')),
  stop_reason text,
  operator_name text,
  production_meter numeric not null default 0,
  created_at timestamptz not null default now(),
  constraint security_machine_update_lines_machine_unique unique (update_id, machine_no)
);

create index if not exists security_machine_update_lines_update_idx
  on public.security_machine_update_lines (update_id);

create index if not exists security_machine_update_lines_operator_idx
  on public.security_machine_update_lines (operator_name);

alter table public.security_operators enable row level security;
alter table public.security_machine_updates enable row level security;
alter table public.security_machine_update_lines enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'security_operators',
    'security_machine_updates',
    'security_machine_update_lines'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_authenticated_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      t || '_authenticated_all', t
    );
  end loop;
end $$;

grant all on table public.security_operators to anon, authenticated, service_role;
grant all on table public.security_machine_updates to anon, authenticated, service_role;
grant all on table public.security_machine_update_lines to anon, authenticated, service_role;
