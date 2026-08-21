-- Payroll Master Job List — apply in Supabase SQL editor if migrations are manual.
-- Mirror of supabase/migrations/20260821000300_payroll_job_master.sql

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

create index if not exists idx_payroll_jobs_active
  on public.payroll_jobs (is_active, job_name);

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
    ('sweeper 1', '152350'),
    ('sweeper 2', '152351'),
    ('Cleaner', '152352'),
    ('Maintenance man', '152353'),
    ('Supervisor', '152354'),
    ('Signal man / 2nd', '152355'),
    ('Watcher', '152356')
) as v(job_name, job_code)
where not exists (
  select 1 from public.payroll_jobs j
  where lower(trim(j.job_name)) = lower(trim(v.job_name))
);
