-- Order to Program (Machine-wise) — Sales & Production flow
-- Additive only. Does NOT alter Design Intake / DIN Costing / Rate Master business logic.

-- ---------- Order header extensions ----------
alter table public.order_book
  add column if not exists din_id uuid references public.dins(id) on delete set null,
  add column if not exists item_name text,
  add column if not exists delivery_within_days integer,
  add column if not exists discount_amount numeric default 0,
  add column if not exists overall_status text default 'ORDER RECEIVED',
  add column if not exists sales_rate numeric,
  add column if not exists quality_name text,
  add column if not exists design_preview_url text,
  add column if not exists total_order_meter numeric default 0,
  add column if not exists total_amount numeric default 0,
  add column if not exists net_amount numeric default 0,
  add column if not exists delivery_requirement text,
  add column if not exists payment_terms text;

alter table public.order_book_items
  add column if not exists matching_name text,
  add column if not exists matching_id uuid references public.din_matchings(id) on delete set null,
  add column if not exists other_info text;

-- ---------- Program / Job Card extensions ----------
alter table public.programs
  add column if not exists operator_name text,
  add column if not exists warp_name text,
  add column if not exists warp_manual text,
  add column if not exists warp_is_manual boolean default false,
  add column if not exists program_date date,
  add column if not exists taka numeric,
  add column if not exists total_weft_weight_kg numeric,
  add column if not exists add_weight_pct numeric default 2,
  add column if not exists final_weight_kg numeric,
  add column if not exists recipe_is_override boolean default false,
  add column if not exists remarks text,
  add column if not exists production_status text default 'PENDING',
  add column if not exists produced_meter numeric default 0,
  add column if not exists produced_taka numeric,
  add column if not exists actual_weft_weight_kg numeric,
  add column if not exists shortage_excess_kg numeric,
  add column if not exists production_date date,
  add column if not exists production_remarks text,
  add column if not exists order_id uuid references public.order_book(id) on delete set null,
  add column if not exists matching_id uuid references public.din_matchings(id) on delete set null,
  add column if not exists design_preview_url text;

create index if not exists idx_programs_order_id on public.programs (order_id);
create index if not exists idx_programs_program_date on public.programs (program_date);

-- ---------- Program recipe override (max 6 feeders) — does NOT overwrite master design_costing_weft ----------
create table if not exists public.program_recipe_feeders (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  feeder_no int not null check (feeder_no >= 1 and feeder_no <= 6),
  yarn_weft text,
  colour text,
  denier_tex text,
  quality text,
  pick_ends numeric default 0,
  weight_kg numeric default 0,
  costing_weft_id uuid,
  is_override boolean not null default false,
  created_at timestamptz not null default now(),
  unique (program_id, feeder_no)
);

create index if not exists idx_program_recipe_program on public.program_recipe_feeders (program_id);

alter table public.program_recipe_feeders enable row level security;

drop policy if exists program_recipe_feeders_authenticated_all on public.program_recipe_feeders;
create policy program_recipe_feeders_authenticated_all
  on public.program_recipe_feeders for all to authenticated using (true) with check (true);

drop policy if exists program_recipe_feeders_anon_all on public.program_recipe_feeders;
create policy program_recipe_feeders_anon_all
  on public.program_recipe_feeders for all to anon using (true) with check (true);

grant all on table public.program_recipe_feeders to anon, authenticated, service_role;

-- ---------- Ensure anon RLS on order/program tables used by PIN login ----------
do $$
declare
  t text;
begin
  foreach t in array array['order_book', 'order_book_items', 'programs', 'program_petty']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_anon_all', t);
    execute format(
      'create policy %I on public.%I for all to anon using (true) with check (true)',
      t || '_anon_all', t
    );
  end loop;
end $$;
