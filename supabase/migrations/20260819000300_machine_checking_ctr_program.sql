-- Machine Production Report, Checking & Dispatch, CTR Stock, Program Book
-- Mirror: public/migration-machine-checking-ctr-program.sql
-- Verified FKs against live schema: job_cards(id), challans(id), gate_pass

-- ---------------------------------------------------------------------------
-- Shared: app_settings (lot number start / next)
-- ---------------------------------------------------------------------------
create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

drop policy if exists app_settings_all on public.app_settings;
create policy app_settings_all
  on public.app_settings for all to authenticated
  using (true) with check (true);

grant select, insert, update, delete on table public.app_settings to authenticated;
grant all on table public.app_settings to service_role;

insert into public.app_settings (key, value)
values ('checking_lot_next', '1')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- PART A — Machine Production Report
-- ---------------------------------------------------------------------------
create table if not exists public.machine_production_report (
  id uuid primary key default gen_random_uuid(),
  report_date date not null default (timezone('utc', now())::date),
  machine_no text not null check (machine_no in ('M1','M2','M3','M4','M5','M6')),
  shift text not null check (shift in ('Day','Night')),
  total_meters numeric not null default 0,
  warp_broken_count integer not null default 0,
  weft_broken_count integer not null default 0,
  working_hours numeric not null default 0,
  shift_hours numeric not null default 12,
  difference_hours numeric not null default 0,
  efficiency_percent numeric not null default 0,
  entered_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_mpr_date_machine
  on public.machine_production_report (report_date desc, machine_no, shift);

alter table public.machine_production_report enable row level security;

drop policy if exists machine_production_report_all on public.machine_production_report;
create policy machine_production_report_all
  on public.machine_production_report for all to authenticated
  using (true) with check (true);

grant select, insert, update, delete on table public.machine_production_report to authenticated;
grant all on table public.machine_production_report to service_role;

-- ---------------------------------------------------------------------------
-- PART B — Checking entries (FK → job_cards.id verified on live DB)
-- ---------------------------------------------------------------------------
create table if not exists public.checking_entries (
  id uuid primary key default gen_random_uuid(),
  job_card_id uuid not null references public.job_cards (id) on delete restrict,
  ok_meters numeric not null default 0,
  damage_meters numeric not null default 0,
  fresh_meters numeric not null default 0,
  total_meters numeric not null default 0,
  damage_reason text,
  lot_number integer not null,
  entry_date date not null default (timezone('utc', now())::date),
  entered_by text not null,
  status text not null default 'checking'
    check (status in ('checking', 'ready_for_dispatch', 'dispatched')),
  party_name text,
  dno text,
  colour text,
  machine_no text,
  program_meter numeric,
  challan_id uuid references public.challans (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_checking_entries_status
  on public.checking_entries (status, entry_date desc);
create index if not exists idx_checking_entries_job
  on public.checking_entries (job_card_id);
create index if not exists idx_checking_entries_lot
  on public.checking_entries (lot_number desc);

alter table public.checking_entries enable row level security;

drop policy if exists checking_entries_all on public.checking_entries;
create policy checking_entries_all
  on public.checking_entries for all to authenticated
  using (true) with check (true);

grant select, insert, update, delete on table public.checking_entries to authenticated;
grant all on table public.checking_entries to service_role;

-- ---------------------------------------------------------------------------
-- PART C — Extend gate_pass with tempo_number (Prompt 1 Part E pattern)
-- ---------------------------------------------------------------------------
alter table public.gate_pass
  add column if not exists tempo_number text;

-- ---------------------------------------------------------------------------
-- PART D — CTR Colour Stock + Daily Issue
-- ---------------------------------------------------------------------------
create table if not exists public.ctr_colour_stock (
  id uuid primary key default gen_random_uuid(),
  colour_name text not null unique,
  opening_stock_kg numeric not null default 0,
  current_stock_kg numeric not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.ctr_daily_issue (
  id uuid primary key default gen_random_uuid(),
  issue_date date not null default (timezone('utc', now())::date),
  machine_no text not null check (machine_no in ('M1','M2','M3','M4','M5','M6')),
  colour_id uuid not null references public.ctr_colour_stock (id) on delete restrict,
  gola_weight_kg numeric not null default 0,
  total_kg numeric not null default 0,
  entered_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_ctr_daily_issue_date
  on public.ctr_daily_issue (issue_date desc);
create index if not exists idx_ctr_daily_issue_colour
  on public.ctr_daily_issue (colour_id);

alter table public.ctr_colour_stock enable row level security;
alter table public.ctr_daily_issue enable row level security;

drop policy if exists ctr_colour_stock_all on public.ctr_colour_stock;
create policy ctr_colour_stock_all
  on public.ctr_colour_stock for all to authenticated
  using (true) with check (true);

drop policy if exists ctr_daily_issue_all on public.ctr_daily_issue;
create policy ctr_daily_issue_all
  on public.ctr_daily_issue for all to authenticated
  using (true) with check (true);

grant select, insert, update, delete on table public.ctr_colour_stock to authenticated;
grant select, insert, update, delete on table public.ctr_daily_issue to authenticated;
grant all on table public.ctr_colour_stock to service_role;
grant all on table public.ctr_daily_issue to service_role;

-- Seed CTR colour dropdown options (opening/current 0 until set)
insert into public.ctr_colour_stock (colour_name, opening_stock_kg, current_stock_kg)
select v.colour_name, 0, 0
from (values
  ('Maroon'),
  ('Wine'),
  ('Mehendi'),
  ('Firozi'),
  ('Pink'),
  ('Coffee'),
  ('Grey'),
  ('Navy Blue'),
  ('HSVy 450'),
  ('HSVy 660'),
  ('Champion Gold'),
  ('Champion Ivory'),
  ('Other')
) as v(colour_name)
where not exists (
  select 1 from public.ctr_colour_stock s where s.colour_name = v.colour_name
);

-- ---------------------------------------------------------------------------
-- PART E — Program Book
-- ---------------------------------------------------------------------------
create table if not exists public.program_book (
  id uuid primary key default gen_random_uuid(),
  program_number text not null,
  linked_machine text,
  matching_card_ref text,
  print_status text not null default 'pending'
    check (print_status in ('pending', 'printed', 'selected')),
  job_card_ref text,
  note text,
  entry_date date not null default (timezone('utc', now())::date),
  entered_by text,
  created_at timestamptz not null default now()
);

create index if not exists idx_program_book_number
  on public.program_book (program_number);
create index if not exists idx_program_book_machine
  on public.program_book (linked_machine);

alter table public.program_book enable row level security;

drop policy if exists program_book_all on public.program_book;
create policy program_book_all
  on public.program_book for all to authenticated
  using (true) with check (true);

grant select, insert, update, delete on table public.program_book to authenticated;
grant all on table public.program_book to service_role;
