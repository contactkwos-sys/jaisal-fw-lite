-- Machine-wise Maintenance module (JAISAL FW)
-- Copy of supabase/migrations/20260821140000_machine_wise_maintenance.sql for mobile/SQL editor.
-- Additive only: new CMMS tables + extend maintenance_requests. No deletes.

-- ---------- Contacts Directory ----------
create table if not exists public.maint_contacts (
  id uuid primary key default gen_random_uuid(),
  contact_name text not null,
  category text not null default 'Other',
  mobile1 text,
  mobile2 text,
  company text,
  remarks text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists maint_contacts_active_idx
  on public.maint_contacts (is_active, contact_name);

-- ---------- Machine Breakdowns (full tracking) ----------
create table if not exists public.machine_breakdowns (
  id uuid primary key default gen_random_uuid(),
  machine_no text not null,
  breakdown_date date not null default current_date,
  breakdown_time time not null default localtime,
  shift text not null default 'Day',
  fault_type text not null default 'Other',
  sub_fault text,
  priority text not null default 'Medium',
  description text,
  contact_id uuid references public.maint_contacts (id) on delete set null,
  contact_name text,
  contact_mobile1 text,
  contact_mobile2 text,
  status text not null default 'OPEN',
  breakdown_at timestamptz not null default now(),
  called_at timestamptz,
  arrived_at timestamptz,
  work_started_at timestamptz,
  resolved_at timestamptz,
  response_minutes numeric,
  repair_minutes numeric,
  downtime_minutes numeric,
  done_by text,
  work_performed text,
  root_cause text,
  action_taken text,
  remarks text,
  labour_charges numeric not null default 0,
  parts_charges numeric not null default 0,
  other_charges numeric not null default 0,
  total_amount numeric not null default 0,
  payment_mode text,
  payment_status text not null default 'Pending',
  payment_date date,
  payment_remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists machine_breakdowns_machine_idx
  on public.machine_breakdowns (machine_no, breakdown_date desc);
create index if not exists machine_breakdowns_status_idx
  on public.machine_breakdowns (status);
create index if not exists machine_breakdowns_fault_idx
  on public.machine_breakdowns (fault_type);

-- ---------- Parts used on a breakdown ----------
create table if not exists public.machine_breakdown_parts (
  id uuid primary key default gen_random_uuid(),
  breakdown_id uuid not null references public.machine_breakdowns (id) on delete cascade,
  spare_part_id uuid,
  part_name text not null,
  part_number text,
  qty numeric not null default 1,
  amount numeric not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists machine_breakdown_parts_bd_idx
  on public.machine_breakdown_parts (breakdown_id);

-- ---------- Complaint Register ----------
create table if not exists public.maint_complaints (
  id uuid primary key default gen_random_uuid(),
  complaint_date date not null default current_date,
  machine_no text not null,
  complaint text not null,
  reported_by text,
  priority text not null default 'Medium',
  assigned_to text,
  status text not null default 'Open',
  resolution text,
  resolved_date date,
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists maint_complaints_machine_idx
  on public.maint_complaints (machine_no, complaint_date desc);

-- ---------- Extend maintenance_requests for planned maintenance entry ----------
alter table public.maintenance_requests
  add column if not exists entry_date date default current_date,
  add column if not exists maintenance_type text default 'General',
  add column if not exists work_details text,
  add column if not exists parts_used text,
  add column if not exists next_maintenance_date date,
  add column if not exists remarks text,
  add column if not exists technician text;

update public.maintenance_requests
set technician = assigned_to
where (technician is null or trim(technician) = '')
  and assigned_to is not null;

update public.maintenance_requests
set work_details = problem
where (work_details is null or trim(work_details) = '')
  and problem is not null;

update public.maintenance_requests
set entry_date = (created_at at time zone 'Asia/Kolkata')::date
where entry_date is null;

-- ---------- Maintenance Schedule ----------
create table if not exists public.maint_schedules (
  id uuid primary key default gen_random_uuid(),
  machine_no text not null,
  maintenance_type text not null default 'Preventive',
  last_done date,
  next_due date not null,
  assigned_person text,
  status text not null default 'Upcoming',
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists maint_schedules_due_idx
  on public.maint_schedules (next_due, machine_no);

-- ---------- Spare Parts stock ----------
create table if not exists public.maint_spare_parts (
  id uuid primary key default gen_random_uuid(),
  part_name text not null,
  part_number text,
  machine_no text,
  opening_stock numeric not null default 0,
  received numeric not null default 0,
  used numeric not null default 0,
  min_stock numeric not null default 0,
  rate numeric not null default 0,
  supplier text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists maint_spare_parts_name_idx
  on public.maint_spare_parts (lower(trim(part_name)));

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'machine_breakdown_parts_spare_fk'
      and table_name = 'machine_breakdown_parts'
  ) then
    alter table public.machine_breakdown_parts
      add constraint machine_breakdown_parts_spare_fk
      foreign key (spare_part_id) references public.maint_spare_parts (id) on delete set null;
  end if;
end $$;

insert into public.maint_schedules (machine_no, maintenance_type, next_due, status, remarks)
select v.machine_no, 'Preventive', current_date + 30, 'Upcoming', 'Auto-seeded schedule'
from (
  values ('M1'), ('M2'), ('M3'), ('M4'), ('M5'), ('M6')
) as v(machine_no)
where not exists (select 1 from public.maint_schedules s where s.machine_no = v.machine_no);

alter table public.maint_contacts enable row level security;
alter table public.machine_breakdowns enable row level security;
alter table public.machine_breakdown_parts enable row level security;
alter table public.maint_complaints enable row level security;
alter table public.maint_schedules enable row level security;
alter table public.maint_spare_parts enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'maint_contacts',
    'machine_breakdowns',
    'machine_breakdown_parts',
    'maint_complaints',
    'maint_schedules',
    'maint_spare_parts'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_authenticated_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      t || '_authenticated_all', t
    );
    execute format('grant all on table public.%I to anon, authenticated, service_role', t);
  end loop;
end $$;
