-- Yarn Stock ERP extensions (additive — does not drop or reset data)
-- Extends weft_yarn_stock master fields + movement ledger + PIN audit

-- ---------- weft_yarn_stock master extensions ----------
alter table public.weft_yarn_stock
  add column if not exists quality text,
  add column if not exists yarn_specification text,
  add column if not exists unit text not null default 'KG',
  add column if not exists opening_stock numeric not null default 0,
  add column if not exists rate_per_kg numeric not null default 0,
  add column if not exists reorder_level numeric not null default 50,
  add column if not exists min_stock numeric not null default 0,
  add column if not exists max_stock numeric,
  add column if not exists lot_number text,
  add column if not exists location text,
  add column if not exists gst_pct numeric not null default 0,
  add column if not exists hsn_code text,
  add column if not exists remarks text,
  add column if not exists is_active boolean not null default true;

-- Backfill opening_stock from current stock where opening is still 0 and stock > 0
update public.weft_yarn_stock
set opening_stock = stock_kg
where coalesce(opening_stock, 0) = 0
  and coalesce(stock_kg, 0) > 0;

-- ---------- yarn stock ledger (movements) ----------
create table if not exists public.yarn_stock_ledger (
  id uuid primary key default gen_random_uuid(),
  yarn_id uuid not null references public.weft_yarn_stock (id) on delete cascade,
  txn_date date not null default current_date,
  txn_no text,
  txn_type text not null, -- inward | outward | adjustment | opening | purchase
  reference text,
  inward_kg numeric not null default 0,
  outward_kg numeric not null default 0,
  balance_kg numeric not null default 0,
  rate numeric not null default 0,
  value_amount numeric not null default 0,
  lot_number text,
  location text,
  gst_pct numeric not null default 0,
  invoice_no text,
  remarks text,
  created_by uuid references public.users (id),
  created_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists yarn_stock_ledger_yarn_id_idx
  on public.yarn_stock_ledger (yarn_id, created_at);

create index if not exists yarn_stock_ledger_txn_date_idx
  on public.yarn_stock_ledger (txn_date desc);

-- ---------- PIN change audit (never stores plaintext PIN) ----------
create table if not exists public.pin_change_audit (
  id uuid primary key default gen_random_uuid(),
  role_id uuid references public.roles (id) on delete set null,
  role_name text not null,
  action text not null, -- change | auto_generate | bulk_generate
  changed_by uuid references public.users (id),
  changed_by_name text,
  created_at timestamptz not null default now()
);

-- ---------- RLS + grants ----------
alter table public.yarn_stock_ledger enable row level security;
alter table public.pin_change_audit enable row level security;

drop policy if exists "yarn_stock_ledger_authenticated_all" on public.yarn_stock_ledger;
create policy "yarn_stock_ledger_authenticated_all"
  on public.yarn_stock_ledger for all to authenticated
  using (true) with check (true);

drop policy if exists "pin_change_audit_authenticated_all" on public.pin_change_audit;
create policy "pin_change_audit_authenticated_all"
  on public.pin_change_audit for all to authenticated
  using (true) with check (true);

grant all on table public.yarn_stock_ledger to anon, authenticated, service_role;
grant all on table public.pin_change_audit to anon, authenticated, service_role;
