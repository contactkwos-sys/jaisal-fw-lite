-- Mirror of supabase/migrations/20260819000100_cashbook_entries.sql
-- Paste into Supabase SQL editor for project doitrzsyvcipugmrzykx if needed.

create table if not exists public.cashbook_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null default (timezone('utc', now())::date),
  entry_type text not null,
  party_name text not null,
  contact_number text,
  category text not null,
  machine_number text,
  purpose_notes text,
  amount numeric(14, 2) not null,
  entered_by text not null,
  created_at timestamptz not null default now(),
  edited_by text,
  edit_approved_by text,
  edit_approved_at timestamptz,
  constraint cashbook_entries_entry_type_check
    check (entry_type in ('credit', 'debit')),
  constraint cashbook_entries_category_check
    check (category in (
      'Deposit from Owner',
      'Machine Repair',
      'Tempo/Transport',
      'Beam Supplier',
      'Other'
    )),
  constraint cashbook_entries_amount_positive check (amount > 0),
  constraint cashbook_entries_machine_repair_requires_machine
    check (
      category <> 'Machine Repair'
      or (machine_number is not null and length(trim(machine_number)) > 0)
    )
);

create index if not exists idx_cashbook_entries_entry_date
  on public.cashbook_entries (entry_date desc);
create index if not exists idx_cashbook_entries_party_lower
  on public.cashbook_entries (lower(party_name));
create index if not exists idx_cashbook_entries_created_at
  on public.cashbook_entries (created_at desc);
create index if not exists idx_cashbook_entries_entry_type
  on public.cashbook_entries (entry_type);

alter table public.cashbook_entries enable row level security;

drop policy if exists cashbook_entries_select on public.cashbook_entries;
create policy cashbook_entries_select
  on public.cashbook_entries
  for select
  to authenticated
  using (true);

drop policy if exists cashbook_entries_insert on public.cashbook_entries;
create policy cashbook_entries_insert
  on public.cashbook_entries
  for insert
  to authenticated
  with check (true);

drop policy if exists cashbook_entries_update on public.cashbook_entries;
create policy cashbook_entries_update
  on public.cashbook_entries
  for update
  to authenticated
  using (true)
  with check (edit_approved_by is not null and length(trim(edit_approved_by)) > 0);

drop policy if exists cashbook_entries_delete on public.cashbook_entries;
create policy cashbook_entries_delete
  on public.cashbook_entries
  for delete
  to authenticated
  using (edit_approved_by is not null and length(trim(edit_approved_by)) > 0);

grant select, insert, update, delete on table public.cashbook_entries to authenticated;
grant all on table public.cashbook_entries to service_role;
