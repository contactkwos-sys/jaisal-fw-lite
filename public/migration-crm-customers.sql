-- Mirror of supabase/migrations/20260818000200_crm_customers.sql

create table if not exists public.crm_customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  whatsapp_number text not null,
  source text not null default 'jaisal_manual',
  kmos_party_id text,
  notes text,
  created_at timestamptz not null default now(),
  constraint crm_customers_source_check check (source in ('jaisal_manual', 'kmos_sync')),
  constraint crm_customers_whatsapp_unique unique (whatsapp_number),
  constraint crm_customers_kmos_party_id_unique unique (kmos_party_id)
);

create index if not exists idx_crm_customers_name_lower on public.crm_customers (lower(name));
create index if not exists idx_crm_customers_whatsapp on public.crm_customers (whatsapp_number);
create index if not exists idx_crm_customers_source on public.crm_customers (source);
create index if not exists idx_crm_customers_created_at on public.crm_customers (created_at desc);

alter table public.crm_customers enable row level security;

drop policy if exists crm_customers_authenticated_all on public.crm_customers;
create policy crm_customers_authenticated_all
  on public.crm_customers
  for all
  to authenticated
  using (true)
  with check (true);

grant all on table public.crm_customers to anon, authenticated, service_role;
