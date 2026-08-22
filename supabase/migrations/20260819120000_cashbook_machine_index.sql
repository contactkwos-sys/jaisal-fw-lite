-- Index for machine-wise expense reporting on cash book debit entries.
-- machine_number already exists on cashbook_entries; this only adds a filter index.
-- Mirror: public/migration-cashbook-machine-index.sql

create index if not exists idx_cashbook_entries_machine_number
  on public.cashbook_entries (machine_number)
  where machine_number is not null and length(trim(machine_number)) > 0;

create index if not exists idx_cashbook_entries_type_machine
  on public.cashbook_entries (entry_type, machine_number)
  where entry_type = 'debit';
