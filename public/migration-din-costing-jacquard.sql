-- DIN Costing (Jacquard Repair Design) — mirror of supabase/migrations/20260823100000_din_costing_jacquard.sql

create table if not exists public.din_formula_master (
  id uuid primary key default gen_random_uuid(),
  calc_factor numeric not null default 9000000,
  default_base_length_mtr numeric not null default 110,
  default_wastage_mtr numeric not null default 10,
  default_wastage_percent numeric not null default 10,
  default_usable_length_mtr numeric not null default 100,
  updated_by uuid references auth.users(id),
  updated_at timestamptz default now()
);

insert into public.din_formula_master (calc_factor, default_base_length_mtr, default_wastage_mtr, default_wastage_percent, default_usable_length_mtr)
select 9000000, 110, 10, 10, 100
where not exists (select 1 from public.din_formula_master limit 1);

alter table public.din_formula_master enable row level security;

drop policy if exists din_formula_master_authenticated_all on public.din_formula_master;
create policy din_formula_master_authenticated_all
  on public.din_formula_master for all to authenticated using (true) with check (true);

grant all on table public.din_formula_master to anon, authenticated, service_role;

alter table public.design_costing
  add column if not exists wastage_mtr numeric,
  add column if not exists wastage_percent numeric,
  add column if not exists usable_length_mtr numeric,
  add column if not exists conversion_multiplier numeric,
  add column if not exists mu_amount numeric,
  add column if not exists ceo_final_selling_rate numeric,
  add column if not exists fixed_cost_per_mtr numeric,
  add column if not exists desired_profit_per_mtr numeric,
  add column if not exists production_meters numeric,
  add column if not exists total_profit numeric,
  add column if not exists margin_pct_on_cost numeric,
  add column if not exists margin_pct_on_selling numeric,
  add column if not exists finalized_by uuid references auth.users(id),
  add column if not exists finalized_at timestamptz,
  add column if not exists is_locked boolean not null default false;

update public.design_costing
set
  wastage_mtr = coalesce(wastage_mtr, 10),
  wastage_percent = coalesce(wastage_percent, 10),
  usable_length_mtr = coalesce(
    usable_length_mtr,
    greatest(coalesce(design_length_mtr, 110) - 10, 100)
  ),
  conversion_multiplier = coalesce(
    conversion_multiplier,
    case
      when coalesce(design_length_mtr, 110) > 0 and greatest(coalesce(design_length_mtr, 110) - 10, 100) > 0
        then round((coalesce(design_length_mtr, 110) / greatest(coalesce(design_length_mtr, 110) - 10, 100))::numeric, 4)
      else 1.10
    end
  )
where wastage_mtr is null or usable_length_mtr is null or conversion_multiplier is null;

create table if not exists public.design_costing_audit (
  id uuid primary key default gen_random_uuid(),
  costing_id uuid not null references public.design_costing(id) on delete cascade,
  din_number text not null,
  action text not null,
  field_name text,
  previous_value text,
  new_value text,
  reason text,
  changed_by uuid references auth.users(id),
  changed_by_name text,
  created_at timestamptz default now()
);

create index if not exists idx_design_costing_audit_costing on public.design_costing_audit (costing_id);
create index if not exists idx_design_costing_audit_din on public.design_costing_audit (din_number);

alter table public.design_costing_audit enable row level security;

drop policy if exists design_costing_audit_authenticated_all on public.design_costing_audit;
create policy design_costing_audit_authenticated_all
  on public.design_costing_audit for all to authenticated using (true) with check (true);

grant all on table public.design_costing_audit to anon, authenticated, service_role;

alter table public.design_costing drop constraint if exists design_costing_status_check;
alter table public.design_costing
  add constraint design_costing_status_check
  check (status in ('draft', 'final'));
