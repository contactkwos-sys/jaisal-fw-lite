-- Allow "Other" payment mode on salary advance transactions
alter table public.salary_advance_transactions
  drop constraint if exists salary_advance_payment_mode_check;

alter table public.salary_advance_transactions
  add constraint salary_advance_payment_mode_check
  check (payment_mode in ('Cash', 'Cheque', 'Bank Transfer', 'Other'));
