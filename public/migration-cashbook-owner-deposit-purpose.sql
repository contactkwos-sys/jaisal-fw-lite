-- Cash Book: Deposit from Owner must record purpose
-- Mirror of supabase/migrations/20260820000100_cashbook_owner_deposit_purpose.sql
-- Run in Supabase SQL editor if migrations are applied manually.

alter table public.cashbook_entries
  drop constraint if exists cashbook_entries_owner_deposit_requires_purpose;

alter table public.cashbook_entries
  add constraint cashbook_entries_owner_deposit_requires_purpose
  check (
    category <> 'Deposit from Owner'
    or (purpose_notes is not null and length(trim(purpose_notes)) > 0)
  );
