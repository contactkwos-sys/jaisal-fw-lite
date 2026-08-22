-- Daily Pending Work (Factory) — additive module

create table if not exists public.dpw_common_problems (
  id uuid primary key default gen_random_uuid(),
  problem_text text not null,
  name_key text not null,
  usage_count int not null default 0,
  created_at timestamptz not null default now(),
  constraint dpw_common_problems_key_unique unique (name_key)
);

create table if not exists public.dpw_daily_works (
  id uuid primary key default gen_random_uuid(),
  work_id text not null,
  work_date date not null default current_date,
  work_category text not null default 'machine',
  work_time time,
  machine_no text,
  machine_name text,
  area text,
  work_description text,
  common_problem_id uuid references public.dpw_common_problems (id) on delete set null,
  machine_status text,
  status text not null default 'Pending',
  priority text default 'Medium',
  assigned_to text,
  contact_id uuid,
  contact_source text,
  contact_name text,
  contact_phone text,
  contact_phone_business text,
  remarks text,
  is_carry_forward boolean not null default false,
  original_work_date date,
  carry_forward_to_date date,
  parent_work_id uuid references public.dpw_daily_works (id) on delete set null,
  completed_at timestamptz,
  completed_by text,
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dpw_daily_works_work_id_unique unique (work_id)
);

create index if not exists dpw_daily_works_date_idx on public.dpw_daily_works (work_date desc);
create index if not exists dpw_daily_works_status_idx on public.dpw_daily_works (status);
create index if not exists dpw_daily_works_machine_idx on public.dpw_daily_works (machine_no, work_date);
create index if not exists dpw_daily_works_carry_idx on public.dpw_daily_works (carry_forward_to_date)
  where carry_forward_to_date is not null;

create table if not exists public.dpw_work_status_history (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.dpw_daily_works (id) on delete cascade,
  old_status text,
  new_status text not null,
  changed_by text,
  remarks text,
  changed_at timestamptz not null default now()
);

create index if not exists dpw_work_status_history_work_idx
  on public.dpw_work_status_history (work_id, changed_at desc);

create table if not exists public.dpw_work_communication_history (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.dpw_daily_works (id) on delete cascade,
  activity text not null,
  communication_mode text,
  message text,
  person text,
  activity_at timestamptz not null default now()
);

create index if not exists dpw_work_comm_history_work_idx
  on public.dpw_work_communication_history (work_id, activity_at desc);

insert into public.dpw_common_problems (problem_text, name_key) values
  ('Sensor not working', 'sensor not working'),
  ('Motor problem', 'motor problem'),
  ('VFD overload', 'vfd overload'),
  ('Belt problem', 'belt problem'),
  ('Bearing problem', 'bearing problem'),
  ('Air pressure problem', 'air pressure problem'),
  ('Electrical problem', 'electrical problem'),
  ('Oil leakage', 'oil leakage'),
  ('Temperature problem', 'temperature problem'),
  ('Production stopped', 'production stopped'),
  ('Other', 'other')
on conflict (name_key) do nothing;

alter table public.dpw_common_problems enable row level security;
alter table public.dpw_daily_works enable row level security;
alter table public.dpw_work_status_history enable row level security;
alter table public.dpw_work_communication_history enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'dpw_common_problems','dpw_daily_works','dpw_work_status_history','dpw_work_communication_history'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      t || '_all', t
    );
  end loop;
end $$;

grant all on table public.dpw_common_problems to authenticated, service_role;
grant all on table public.dpw_daily_works to authenticated, service_role;
grant all on table public.dpw_work_status_history to authenticated, service_role;
grant all on table public.dpw_work_communication_history to authenticated, service_role;
