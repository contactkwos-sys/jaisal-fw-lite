-- Mirror of supabase/migrations/20260822120000_warp_beam_stock_entry.sql
-- Apply manually in Supabase SQL Editor if CLI is unavailable.

-- ---------- Warp yarn item master (autocomplete) ----------
create table if not exists public.warp_yarn_items (
  id uuid primary key default gen_random_uuid(),
  item_name text not null,
  name_key text not null,
  yarn_type text not null default 'Wet Yarn',
  created_by text,
  created_at timestamptz not null default now(),
  constraint warp_yarn_items_name_key_unique unique (name_key)
);

create index if not exists warp_yarn_items_name_idx on public.warp_yarn_items (item_name);

insert into public.warp_yarn_items (item_name, name_key, yarn_type, created_by)
select distinct
  trim(yarn_quality) as item_name,
  lower(regexp_replace(regexp_replace(trim(yarn_quality), '[^a-zA-Z0-9 ]', '', 'g'), '\s+', ' ', 'g')) as name_key,
  'Wet Yarn',
  'migration'
from public.warp_pipes
where yarn_quality is not null
  and length(trim(yarn_quality)) > 0
on conflict (name_key) do nothing;

create table if not exists public.warp_machine_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null default current_date,
  pipe_no text not null,
  item_name text not null,
  yarn_type text not null default 'Wet Yarn',
  notes text,
  total_single_meter numeric not null default 0,
  total_double_meter numeric not null default 0,
  status text not null default 'ACTIVE',
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists warp_machine_entries_date_idx
  on public.warp_machine_entries (entry_date desc, created_at desc);

create table if not exists public.warp_machine_entry_lines (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.warp_machine_entries (id) on delete cascade,
  machine_no text not null,
  single_meter numeric not null default 0,
  double_meter numeric not null default 0,
  pipe_id uuid references public.warp_pipes (id) on delete set null,
  beam_loading_id uuid references public.beam_loading (id) on delete set null,
  status text not null default 'ON_MACHINE',
  created_at timestamptz not null default now()
);

create table if not exists public.warp_gate_passes (
  id uuid primary key default gen_random_uuid(),
  gate_pass_no text not null,
  pass_date date not null default current_date,
  party_name text not null,
  pipe_no text not null,
  item_yarn text,
  single_meter numeric not null default 0,
  double_meter numeric not null default 0,
  purpose text not null default 'Warper / Job Work',
  issued_by text,
  vehicle_no text,
  driver_name text,
  expected_return_date date,
  remarks text,
  status text not null default 'Issued',
  warper_job_id uuid references public.warp_warper_jobs (id) on delete set null,
  ref_type text not null default 'warper',
  ref_id uuid,
  created_at timestamptz not null default now(),
  constraint warp_gate_passes_no_unique unique (gate_pass_no)
);

alter table public.warp_pipes
  add column if not exists pipe_type text,
  add column if not exists yarn_type text default 'Wet Yarn';

alter table public.warp_yarn_items enable row level security;
alter table public.warp_machine_entries enable row level security;
alter table public.warp_machine_entry_lines enable row level security;
alter table public.warp_gate_passes enable row level security;

drop policy if exists warp_yarn_items_all on public.warp_yarn_items;
create policy warp_yarn_items_all on public.warp_yarn_items
  for all to authenticated using (true) with check (true);

drop policy if exists warp_machine_entries_all on public.warp_machine_entries;
create policy warp_machine_entries_all on public.warp_machine_entries
  for all to authenticated using (true) with check (true);

drop policy if exists warp_machine_entry_lines_all on public.warp_machine_entry_lines;
create policy warp_machine_entry_lines_all on public.warp_machine_entry_lines
  for all to authenticated using (true) with check (true);

drop policy if exists warp_gate_passes_all on public.warp_gate_passes;
create policy warp_gate_passes_all on public.warp_gate_passes
  for all to authenticated using (true) with check (true);

grant all on table public.warp_yarn_items to authenticated, service_role;
grant all on table public.warp_machine_entries to authenticated, service_role;
grant all on table public.warp_machine_entry_lines to authenticated, service_role;
grant all on table public.warp_gate_passes to authenticated, service_role;
