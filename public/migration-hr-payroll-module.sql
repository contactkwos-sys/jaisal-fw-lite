-- HR & Payroll module (Attendance → Payroll → Bank Salary Letter)
-- Additive only: extends workers/attendance; reuses payroll_rates; no deletes.

-- ---------- Company settings (letterhead) ----------
create table if not exists public.app_settings (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;
drop policy if exists app_settings_authenticated_all on public.app_settings;
create policy app_settings_authenticated_all
  on public.app_settings for all to authenticated
  using (true) with check (true);
grant all on table public.app_settings to anon, authenticated, service_role;

insert into public.app_settings (key, value)
values (
  'company_profile',
  '{"name":"JAISAL FASHIONWEAVE INDUSTRIES","brand":"JAISAL FW","address":"Fashionweave Industries","phone":"","email":"","gstin":""}'
)
on conflict (key) do nothing;

-- ---------- Payroll job / designation master ----------
create table if not exists public.payroll_jobs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  job_code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists payroll_jobs_name_unique
  on public.payroll_jobs (lower(trim(job_name)));

alter table public.payroll_jobs enable row level security;
drop policy if exists payroll_jobs_authenticated_all on public.payroll_jobs;
create policy payroll_jobs_authenticated_all
  on public.payroll_jobs for all to authenticated
  using (true) with check (true);
grant all on table public.payroll_jobs to anon, authenticated, service_role;

insert into public.payroll_jobs (job_name, job_code)
select v.job_name, v.job_code
from (
  values
    ('ASO', '152345'),
    ('Assistant Security Officer', '152346'),
    ('Security Guard', '152347'),
    ('Security', '152348'),
    ('Sweeper', '152349'),
    ('Quality Inspector', '152360'),
    ('Operator', '152361'),
    ('Supervisor', '152354'),
    ('Cleaner', '152352'),
    ('Maintenance man', '152353')
) as v(job_name, job_code)
where not exists (
  select 1 from public.payroll_jobs j
  where lower(trim(j.job_name)) = lower(trim(v.job_name))
);

-- ---------- Extend workers (Employee Master) ----------
alter table public.workers
  add column if not exists employee_code text,
  add column if not exists designation text,
  add column if not exists shift text default 'Day',
  add column if not exists pay_type text default 'Daily',
  add column if not exists bank_name text,
  add column if not exists bank_account_no text,
  add column if not exists bank_ifsc text,
  add column if not exists bank_branch text,
  add column if not exists phone text,
  add column if not exists joining_date date,
  add column if not exists esi_applicable boolean not null default false,
  add column if not exists pf_applicable boolean not null default false,
  add column if not exists pt_applicable boolean not null default false;

create unique index if not exists workers_employee_code_unique
  on public.workers (employee_code)
  where employee_code is not null and length(trim(employee_code)) > 0;

-- Backfill employee codes for existing workers without codes
do $$
declare
  r record;
  i int := 1;
begin
  for r in
    select id from public.workers
    where employee_code is null or trim(employee_code) = ''
    order by full_name, id
  loop
    update public.workers
      set employee_code = 'EMP' || lpad(i::text, 3, '0')
      where id = r.id;
    i := i + 1;
  end loop;
end $$;

-- ---------- Extend attendance ----------
alter table public.attendance
  add column if not exists shift text,
  add column if not exists remarks text,
  add column if not exists total_hours numeric,
  add column if not exists payable_day numeric,
  add column if not exists updated_at timestamptz default now();

-- ---------- Holidays ----------
create table if not exists public.holidays (
  id uuid primary key default gen_random_uuid(),
  holiday_date date not null unique,
  title text not null,
  is_paid boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.holidays enable row level security;
drop policy if exists holidays_authenticated_all on public.holidays;
create policy holidays_authenticated_all
  on public.holidays for all to authenticated
  using (true) with check (true);
grant all on table public.holidays to anon, authenticated, service_role;

-- ---------- Leave entries ----------
create table if not exists public.leave_entries (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.workers (id) on delete cascade,
  leave_date date not null,
  leave_type text not null default 'Leave',
  remarks text,
  created_at timestamptz not null default now(),
  unique (worker_id, leave_date)
);

alter table public.leave_entries enable row level security;
drop policy if exists leave_entries_authenticated_all on public.leave_entries;
create policy leave_entries_authenticated_all
  on public.leave_entries for all to authenticated
  using (true) with check (true);
grant all on table public.leave_entries to anon, authenticated, service_role;

-- ---------- Salary rate master (per employee, with history) ----------
create table if not exists public.salary_rates (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.workers (id) on delete cascade,
  pay_type text not null default 'Monthly',
  monthly_rate numeric not null default 0,
  daily_rate numeric not null default 0,
  hourly_rate numeric not null default 0,
  ot_rate numeric not null default 0,
  effective_from date not null default current_date,
  status text not null default 'Active',
  approved boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_salary_rates_worker_eff
  on public.salary_rates (worker_id, effective_from desc);

alter table public.salary_rates enable row level security;
drop policy if exists salary_rates_authenticated_all on public.salary_rates;
create policy salary_rates_authenticated_all
  on public.salary_rates for all to authenticated
  using (true) with check (true);
grant all on table public.salary_rates to anon, authenticated, service_role;

-- ---------- Payroll runs & entries ----------
create table if not exists public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  payroll_month text not null,
  from_date date not null,
  to_date date not null,
  status text not null default 'Draft',
  esi_on boolean not null default true,
  pf_on boolean not null default true,
  pt_on boolean not null default true,
  other_deduction_on boolean not null default true,
  working_days numeric not null default 26,
  notes text,
  created_by uuid references public.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payroll_month)
);

create table if not exists public.payroll_entries (
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null references public.payroll_runs (id) on delete cascade,
  worker_id uuid not null references public.workers (id) on delete cascade,
  employee_code text,
  employee_name text,
  designation text,
  department text,
  pay_type text,
  working_days numeric not null default 0,
  present_days numeric not null default 0,
  leave_days numeric not null default 0,
  payable_days numeric not null default 0,
  basic_salary numeric not null default 0,
  allowances numeric not null default 0,
  ot_amount numeric not null default 0,
  gross_salary numeric not null default 0,
  esi_amount numeric not null default 0,
  pf_amount numeric not null default 0,
  pt_amount numeric not null default 0,
  other_deduction numeric not null default 0,
  advance numeric not null default 0,
  total_deduction numeric not null default 0,
  net_payable numeric not null default 0,
  status text not null default 'Draft',
  esi_on boolean,
  pf_on boolean,
  pt_on boolean,
  other_deduction_on boolean,
  bank_name text,
  bank_account_no text,
  bank_ifsc text,
  bank_branch text,
  payment_date date,
  selected_for_letter boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payroll_run_id, worker_id)
);

create index if not exists idx_payroll_entries_run on public.payroll_entries (payroll_run_id);
create index if not exists idx_payroll_entries_status on public.payroll_entries (status);

alter table public.payroll_runs enable row level security;
alter table public.payroll_entries enable row level security;

drop policy if exists payroll_runs_authenticated_all on public.payroll_runs;
create policy payroll_runs_authenticated_all
  on public.payroll_runs for all to authenticated
  using (true) with check (true);

drop policy if exists payroll_entries_authenticated_all on public.payroll_entries;
create policy payroll_entries_authenticated_all
  on public.payroll_entries for all to authenticated
  using (true) with check (true);

grant all on table public.payroll_runs to anon, authenticated, service_role;
grant all on table public.payroll_entries to anon, authenticated, service_role;

-- ---------- Bank salary letters (NOT cheques) ----------
create table if not exists public.bank_salary_letters (
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null references public.payroll_runs (id) on delete cascade,
  letter_no text,
  letter_date date not null default current_date,
  salary_month text not null,
  total_employees integer not null default 0,
  total_amount numeric not null default 0,
  amount_in_words text,
  status text not null default 'Generated',
  created_by uuid references public.users (id),
  created_at timestamptz not null default now()
);

create table if not exists public.bank_salary_letter_items (
  id uuid primary key default gen_random_uuid(),
  letter_id uuid not null references public.bank_salary_letters (id) on delete cascade,
  payroll_entry_id uuid references public.payroll_entries (id) on delete set null,
  sno integer not null default 1,
  employee_code text,
  employee_name text not null,
  designation text,
  bank_name text,
  bank_account_no text,
  bank_ifsc text,
  net_salary numeric not null default 0
);

alter table public.bank_salary_letters enable row level security;
alter table public.bank_salary_letter_items enable row level security;

drop policy if exists bank_salary_letters_authenticated_all on public.bank_salary_letters;
create policy bank_salary_letters_authenticated_all
  on public.bank_salary_letters for all to authenticated
  using (true) with check (true);

drop policy if exists bank_salary_letter_items_authenticated_all on public.bank_salary_letter_items;
create policy bank_salary_letter_items_authenticated_all
  on public.bank_salary_letter_items for all to authenticated
  using (true) with check (true);

grant all on table public.bank_salary_letters to anon, authenticated, service_role;
grant all on table public.bank_salary_letter_items to anon, authenticated, service_role;
