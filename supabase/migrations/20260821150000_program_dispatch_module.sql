-- PROGRAM & DISPATCH module — extend existing order/program/dispatch pipeline
-- Reuses order_book, programs, production_entries, folding_entries, challans, gatepass
-- Does NOT delete existing data.

-- ---------- Party Marka ----------
alter table public.party_master
  add column if not exists marka text,
  add column if not exists party_code text,
  add column if not exists gstin text,
  add column if not exists billing_address text,
  add column if not exists shipping_address text;

create index if not exists idx_party_master_marka on public.party_master (marka);

-- ---------- Order Book headers ----------
alter table public.order_book
  add column if not exists order_no text,
  add column if not exists delivery_date date,
  add column if not exists remarks text,
  add column if not exists party_code text,
  add column if not exists status text default 'Pending';

alter table public.order_book_items
  add column if not exists quality text,
  add column if not exists total_pcs numeric default 0,
  add column if not exists delivery_date date,
  add column if not exists status text default 'Pending';

-- Backfill order_no for existing rows
do $$
declare
  r record;
  i int := 0;
begin
  for r in
    select id from public.order_book where order_no is null order by created_at
  loop
    i := i + 1;
    update public.order_book
      set order_no = 'ORD-' || lpad(i::text, 4, '0')
      where id = r.id;
  end loop;
end $$;

create unique index if not exists idx_order_book_order_no
  on public.order_book (order_no) where order_no is not null;

-- ---------- Programs — machine-wise programming fields ----------
alter table public.programs
  add column if not exists program_no text,
  add column if not exists marka text,
  add column if not exists party_name text,
  add column if not exists design_no text,
  add column if not exists colour text,
  add column if not exists quality text,
  add column if not exists total_pcs numeric default 0,
  add column if not exists total_pick numeric default 0,
  add column if not exists total_meter numeric default 0,
  add column if not exists required_meter numeric default 0,
  add column if not exists planned_date date,
  add column if not exists priority text default 'Normal',
  add column if not exists job_card_no text;

create unique index if not exists idx_programs_program_no
  on public.programs (program_no) where program_no is not null;
create index if not exists idx_programs_machine on public.programs (machine_no);
create index if not exists idx_programs_marka on public.programs (marka);

-- ---------- Checking lots (extends folding workflow; keeps folding_entries) ----------
create table if not exists public.checking_lots (
  id uuid primary key default gen_random_uuid(),
  lot_no text not null unique,
  program_id uuid references public.programs (id) on delete set null,
  marka text,
  meter_in numeric not null default 0,
  checked_meter numeric not null default 0,
  damage_meter numeric not null default 0,
  final_meter numeric not null default 0,
  checker_name text,
  entry_date date not null default current_date,
  shift text,
  remarks text,
  status text not null default 'Checked',
  challan_id uuid references public.challans (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.lot_damages (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.checking_lots (id) on delete cascade,
  damage_type text not null,
  damage_operator text,
  damage_meter numeric not null default 0,
  remarks text,
  created_at timestamptz not null default now()
);

create index if not exists idx_checking_lots_program on public.checking_lots (program_id);
create index if not exists idx_checking_lots_status on public.checking_lots (status);
create index if not exists idx_checking_lots_challan on public.checking_lots (challan_id);
create index if not exists idx_lot_damages_lot on public.lot_damages (lot_id);

-- ---------- Challan / Gatepass extras ----------
alter table public.challans
  add column if not exists marka text,
  add column if not exists design_no text,
  add column if not exists quality text,
  add column if not exists colour text,
  add column if not exists status text default 'Ready';

alter table public.gatepass
  add column if not exists party text,
  add column if not exists marka text,
  add column if not exists total_meter numeric default 0,
  add column if not exists lots_count integer default 0,
  add column if not exists transporter_name text,
  add column if not exists driver_name text,
  add column if not exists gp_time text,
  add column if not exists remarks text;

-- ---------- GST Invoice (optional, linked to challan) ----------
create table if not exists public.gst_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no text not null unique,
  invoice_date date not null default current_date,
  challan_id uuid references public.challans (id) on delete set null,
  party text not null,
  gstin text,
  billing_address text,
  shipping_address text,
  design_no text,
  quality text,
  colour text,
  marka text,
  quantity numeric not null default 0,
  rate numeric not null default 0,
  taxable_value numeric not null default 0,
  gst_pct numeric not null default 5,
  cgst numeric not null default 0,
  sgst numeric not null default 0,
  igst numeric not null default 0,
  grand_total numeric not null default 0,
  is_inter_state boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_gst_invoices_challan on public.gst_invoices (challan_id);
create index if not exists idx_gst_invoices_party on public.gst_invoices (party);

-- ---------- Folding entries link to program (optional) ----------
alter table public.folding_entries
  add column if not exists program_id uuid references public.programs (id) on delete set null,
  add column if not exists lot_no text,
  add column if not exists marka text,
  add column if not exists meter_in numeric,
  add column if not exists damage_meter numeric default 0,
  add column if not exists final_meter numeric,
  add column if not exists checker_name text,
  add column if not exists shift text,
  add column if not exists remarks text;

-- ---------- RLS ----------
alter table public.checking_lots enable row level security;
alter table public.lot_damages enable row level security;
alter table public.gst_invoices enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['checking_lots', 'lot_damages', 'gst_invoices']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_authenticated_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      t || '_authenticated_all', t
    );
  end loop;
end $$;

grant all on table public.checking_lots to anon, authenticated, service_role;
grant all on table public.lot_damages to anon, authenticated, service_role;
grant all on table public.gst_invoices to anon, authenticated, service_role;
