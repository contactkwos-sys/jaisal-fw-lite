-- Mirror of supabase/migrations/20260817000300_order_program_dispatch.sql
-- Paste in Supabase SQL editor if CLI migrate unavailable.

create table if not exists public.order_book (
  id uuid primary key default gen_random_uuid(),
  party_name text not null,
  order_date date not null default current_date,
  payment_days integer,
  discount_pct numeric,
  created_at timestamptz not null default now()
);

create table if not exists public.order_book_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.order_book (id) on delete cascade,
  design_no text,
  colour text,
  qty_meter numeric not null default 0,
  rate numeric not null default 0,
  amount numeric generated always as (qty_meter * rate) stored,
  settled boolean not null default false
);

create table if not exists public.programs (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid references public.order_book_items (id) on delete set null,
  machine_no text,
  status text not null default 'pending',
  dispatched_meter numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.program_petty (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  petty_label text,
  item_name text,
  meter numeric not null default 0
);

create table if not exists public.adjustment_notes (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid references public.order_book_items (id) on delete cascade,
  adjustment_type text not null,
  reason text,
  meter numeric,
  created_at timestamptz not null default now()
);

alter table public.job_cards
  add column if not exists program_id uuid references public.programs (id) on delete set null;
alter table public.job_cards
  add column if not exists job_card_no text;
alter table public.job_cards
  add column if not exists issued_at timestamptz default now();
alter table public.job_cards
  add column if not exists colour text;
alter table public.job_cards
  add column if not exists total_meter numeric;

alter table public.challans
  add column if not exists program_id uuid references public.programs (id) on delete set null;
alter table public.challans
  add column if not exists job_card_id uuid references public.job_cards (id) on delete set null;

alter table public.production_entries
  add column if not exists program_id uuid references public.programs (id) on delete set null;

create index if not exists idx_order_book_party on public.order_book (party_name);
create index if not exists idx_order_book_items_order on public.order_book_items (order_id);
create index if not exists idx_programs_status on public.programs (status);
create index if not exists idx_programs_order_item on public.programs (order_item_id);
create index if not exists idx_program_petty_program on public.program_petty (program_id);
create index if not exists idx_job_cards_program on public.job_cards (program_id);
create index if not exists idx_challans_program on public.challans (program_id);

alter table public.order_book enable row level security;
alter table public.order_book_items enable row level security;
alter table public.programs enable row level security;
alter table public.program_petty enable row level security;
alter table public.adjustment_notes enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'order_book','order_book_items','programs','program_petty','adjustment_notes'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_authenticated_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      t || '_authenticated_all', t
    );
  end loop;
end $$;

grant all on table public.order_book to anon, authenticated, service_role;
grant all on table public.order_book_items to anon, authenticated, service_role;
grant all on table public.programs to anon, authenticated, service_role;
grant all on table public.program_petty to anon, authenticated, service_role;
grant all on table public.adjustment_notes to anon, authenticated, service_role;
