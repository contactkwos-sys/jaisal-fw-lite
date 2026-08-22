-- Warp Yarn audit log — tracks field-level edits for CEO/admin review
-- Run in Supabase SQL Editor after migration-filled-pipe-godown-entry.sql

create table if not exists public.warp_yarn_audit_log (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid not null,
  field_name text not null,
  old_value text,
  new_value text,
  edited_by text not null,
  edited_at timestamptz not null default now()
);

create index if not exists warp_yarn_audit_log_record_idx
  on public.warp_yarn_audit_log (table_name, record_id, edited_at desc);

create index if not exists warp_yarn_audit_log_edited_at_idx
  on public.warp_yarn_audit_log (edited_at desc);

alter table public.warp_yarn_audit_log enable row level security;

drop policy if exists warp_yarn_audit_log_authenticated_all on public.warp_yarn_audit_log;
create policy warp_yarn_audit_log_authenticated_all
  on public.warp_yarn_audit_log for all to authenticated
  using (true) with check (true);

grant all on table public.warp_yarn_audit_log to anon, authenticated, service_role;
