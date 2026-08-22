-- Machine-wise Maintenance — breakdown flow timestamps & contact / parts / payment
-- Additive only; does not drop existing maintenance_requests data.

alter table public.maintenance_requests
  add column if not exists fault_type text,
  add column if not exists contact_name text,
  add column if not exists contact_phone text,
  add column if not exists opened_at timestamptz,
  add column if not exists call_done_at timestamptz,
  add column if not exists arrived_at timestamptz,
  add column if not exists work_started_at timestamptz,
  add column if not exists resolved_at timestamptz,
  add column if not exists parts_changed text,
  add column if not exists payment_amount numeric,
  add column if not exists payment_notes text;

-- Backfill opened_at from created_at where missing
update public.maintenance_requests
  set opened_at = created_at
  where opened_at is null;

create index if not exists idx_maint_req_machine on public.maintenance_requests (machine_no);
create index if not exists idx_maint_req_status on public.maintenance_requests (status);
