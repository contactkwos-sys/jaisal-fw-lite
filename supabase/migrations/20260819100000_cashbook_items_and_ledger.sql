-- Cash Book: itemized line items + items master + party optional + ensure insert RLS
-- Mirror: public/migration-cashbook-items.sql

-- ---------------------------------------------------------------------------
-- PART A — party_name optional (empty / General allowed)
-- ---------------------------------------------------------------------------
alter table public.cashbook_entries
  alter column party_name set default '';

-- Ensure insert remains open for authenticated (fix Save failed from missing/wrong policy)
drop policy if exists cashbook_entries_insert on public.cashbook_entries;
create policy cashbook_entries_insert
  on public.cashbook_entries
  for insert
  to authenticated
  with check (true);

drop policy if exists cashbook_entries_select on public.cashbook_entries;
create policy cashbook_entries_select
  on public.cashbook_entries
  for select
  to authenticated
  using (true);

-- Keep update/delete open (7-day gate is app-layer via pending_approvals)
drop policy if exists cashbook_entries_update on public.cashbook_entries;
create policy cashbook_entries_update
  on public.cashbook_entries
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists cashbook_entries_delete on public.cashbook_entries;
create policy cashbook_entries_delete
  on public.cashbook_entries
  for delete
  to authenticated
  using (true);

grant select, insert, update, delete on table public.cashbook_entries to authenticated;
grant all on table public.cashbook_entries to service_role;

-- ---------------------------------------------------------------------------
-- PART B — items master (autocomplete vocabulary)
-- ---------------------------------------------------------------------------
create table if not exists public.cashbook_items_master (
  id uuid primary key default gen_random_uuid(),
  item_name text not null,
  created_at timestamptz not null default now(),
  constraint cashbook_items_master_name_unique unique (item_name),
  constraint cashbook_items_master_name_nonempty
    check (length(trim(item_name)) > 0)
);

create index if not exists idx_cashbook_items_master_lower
  on public.cashbook_items_master (lower(item_name));

alter table public.cashbook_items_master enable row level security;

drop policy if exists cashbook_items_master_select on public.cashbook_items_master;
create policy cashbook_items_master_select
  on public.cashbook_items_master for select to authenticated using (true);

drop policy if exists cashbook_items_master_insert on public.cashbook_items_master;
create policy cashbook_items_master_insert
  on public.cashbook_items_master for insert to authenticated with check (true);

drop policy if exists cashbook_items_master_update on public.cashbook_items_master;
create policy cashbook_items_master_update
  on public.cashbook_items_master for update to authenticated using (true) with check (true);

grant select, insert, update on table public.cashbook_items_master to authenticated;
grant all on table public.cashbook_items_master to service_role;

insert into public.cashbook_items_master (item_name) values
  ('Ghee'),
  ('Ghee Packet'),
  ('Surf'),
  ('Tea'),
  ('Sugar'),
  ('Oil'),
  ('Transport'),
  ('Other')
on conflict (item_name) do nothing;

-- ---------------------------------------------------------------------------
-- PART B — line items per cash book entry
-- ---------------------------------------------------------------------------
create table if not exists public.cashbook_entry_items (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.cashbook_entries (id) on delete cascade,
  item_name text not null,
  amount numeric(14, 2) not null,
  created_at timestamptz not null default now(),
  constraint cashbook_entry_items_amount_positive check (amount > 0),
  constraint cashbook_entry_items_name_nonempty check (length(trim(item_name)) > 0)
);

create index if not exists idx_cashbook_entry_items_entry
  on public.cashbook_entry_items (entry_id);

alter table public.cashbook_entry_items enable row level security;

drop policy if exists cashbook_entry_items_select on public.cashbook_entry_items;
create policy cashbook_entry_items_select
  on public.cashbook_entry_items for select to authenticated using (true);

drop policy if exists cashbook_entry_items_insert on public.cashbook_entry_items;
create policy cashbook_entry_items_insert
  on public.cashbook_entry_items for insert to authenticated with check (true);

drop policy if exists cashbook_entry_items_update on public.cashbook_entry_items;
create policy cashbook_entry_items_update
  on public.cashbook_entry_items for update to authenticated using (true) with check (true);

drop policy if exists cashbook_entry_items_delete on public.cashbook_entry_items;
create policy cashbook_entry_items_delete
  on public.cashbook_entry_items for delete to authenticated using (true);

grant select, insert, update, delete on table public.cashbook_entry_items to authenticated;
grant all on table public.cashbook_entry_items to service_role;
