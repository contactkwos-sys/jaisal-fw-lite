-- Machine-wise Production & Weft Yarn Issue
-- Links programs → DIN matchings → design_costing_weft → weft_yarn_stock

alter table public.programs
  add column if not exists din_number text,
  add column if not exists matching_no int;

create index if not exists idx_programs_din on public.programs (din_number);

create table if not exists public.machine_weft_issues (
  id uuid primary key default gen_random_uuid(),
  issue_no text not null unique,
  issue_date date not null default current_date,
  shift text,
  machine_no text not null,
  program_id uuid references public.programs (id) on delete set null,
  program_no text,
  job_card_no text,
  din_number text not null,
  din_id uuid references public.dins (id) on delete set null,
  design_name text,
  party_name text,
  marka text,
  matching_no int,
  program_meter numeric not null default 0,
  total_required_kg numeric not null default 0,
  total_issued_kg numeric not null default 0,
  issued_by text,
  received_by text,
  remarks text,
  status text not null default 'Issued',
  allow_over_issue boolean not null default false,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create table if not exists public.machine_weft_issue_items (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.machine_weft_issues (id) on delete cascade,
  matching_no int not null,
  matching_id uuid references public.din_matchings (id) on delete set null,
  colour_name text not null,
  role_label text not null,
  is_main_ground boolean not null default false,
  colour_hex text,
  required_kg numeric not null default 0,
  issued_kg numeric not null default 0,
  balance_kg numeric not null default 0,
  yarn_stock_id uuid references public.weft_yarn_stock (id) on delete set null,
  costing_weft_id uuid,
  denier numeric,
  pic numeric,
  width numeric,
  sr_no int not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists idx_mwi_machine on public.machine_weft_issues (machine_no);
create index if not exists idx_mwi_din on public.machine_weft_issues (din_number);
create index if not exists idx_mwi_program on public.machine_weft_issues (program_id);
create index if not exists idx_mwi_date on public.machine_weft_issues (issue_date);
create index if not exists idx_mwii_issue on public.machine_weft_issue_items (issue_id);

alter table public.machine_weft_issues enable row level security;
alter table public.machine_weft_issue_items enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['machine_weft_issues', 'machine_weft_issue_items']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_authenticated_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      t || '_authenticated_all', t
    );
  end loop;
end $$;

grant all on table public.machine_weft_issues to anon, authenticated, service_role;
grant all on table public.machine_weft_issue_items to anon, authenticated, service_role;
