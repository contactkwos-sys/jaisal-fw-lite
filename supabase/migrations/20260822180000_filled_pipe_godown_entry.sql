-- Filled Pipe Godown Entry — rate, location, audit fields (additive)

alter table public.warp_pipes
  add column if not exists rate_per_kg numeric not null default 0,
  add column if not exists amount numeric not null default 0,
  add column if not exists rate_source text,
  add column if not exists rate_effective_from date,
  add column if not exists rate_master_id uuid references public.rate_master (id) on delete set null,
  add column if not exists godown_name text,
  add column if not exists rack text,
  add column if not exists bay text,
  add column if not exists entry_date date,
  add column if not exists entry_type text,
  add column if not exists original_weight_kg numeric,
  add column if not exists balance_weight_kg numeric,
  add column if not exists entered_by text,
  add column if not exists updated_by text;

alter table public.warp_yarn_transactions
  add column if not exists rate_per_kg numeric not null default 0,
  add column if not exists amount numeric not null default 0,
  add column if not exists rate_source text,
  add column if not exists rate_effective_from date,
  add column if not exists issue_meter numeric,
  add column if not exists updated_by text;

create index if not exists warp_pipes_godown_name_idx on public.warp_pipes (godown_name);
create index if not exists warp_pipes_entry_date_idx on public.warp_pipes (entry_date desc);
