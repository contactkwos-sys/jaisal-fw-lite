-- Mirror of supabase/migrations/20260817000200_purchase_inward_rebuild.sql

create table if not exists public.general_purchases (
  id uuid primary key default gen_random_uuid(),
  purchase_date date not null default current_date,
  party_name text,
  challan_no text,
  gst_pct numeric not null default 0,
  subtotal numeric not null default 0,
  grand_total numeric not null default 0,
  photo_url text,
  input_mode text not null default 'manual',
  created_at timestamptz not null default now()
);

create table if not exists public.general_purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.general_purchases (id) on delete cascade,
  item_name text,
  pieces numeric not null default 0,
  weight_kg numeric not null default 0,
  rate numeric not null default 0,
  billing_mode text not null default 'weight',
  amount numeric generated always as (
    case when billing_mode = 'piece' then pieces * rate else weight_kg * rate end
  ) stored
);

alter table public.weft_purchases
  add column if not exists party_name text,
  add column if not exists challan_no text,
  add column if not exists gst_pct numeric default 0,
  add column if not exists subtotal numeric default 0,
  add column if not exists grand_total numeric default 0,
  add column if not exists purchase_date date default current_date;

create table if not exists public.weft_purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.weft_purchases (id) on delete cascade,
  quality text,
  weight_kg numeric not null default 0,
  rate numeric not null default 0,
  amount numeric generated always as (weight_kg * rate) stored
);

create table if not exists public.maintenance_inward (
  id uuid primary key default gen_random_uuid(),
  inward_date date not null default current_date,
  party_name text,
  challan_no text,
  gst_pct numeric not null default 0,
  subtotal numeric not null default 0,
  grand_total numeric not null default 0,
  photo_url text,
  input_mode text not null default 'manual',
  created_at timestamptz not null default now()
);

create table if not exists public.maintenance_inward_items (
  id uuid primary key default gen_random_uuid(),
  inward_id uuid not null references public.maintenance_inward (id) on delete cascade,
  item_name text,
  qty numeric not null default 0,
  rate numeric not null default 0,
  amount numeric generated always as (qty * rate) stored
);

create table if not exists public.maintenance_repair_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_date date not null default current_date,
  vendor_name text,
  invoice_no text,
  repairing_tracker_id uuid references public.repairing_tracker (id),
  repair_cost numeric not null default 0,
  gst_pct numeric not null default 0,
  grand_total numeric generated always as (repair_cost * (1 + gst_pct / 100.0)) stored,
  photo_url text,
  input_mode text not null default 'manual',
  created_at timestamptz not null default now()
);

do $$
declare
  t text;
begin
  foreach t in array array[
    'general_purchases',
    'general_purchase_items',
    'weft_purchase_items',
    'maintenance_inward',
    'maintenance_inward_items',
    'maintenance_repair_invoices'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_authenticated_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      t || '_authenticated_all',
      t
    );
    execute format('grant all on table public.%I to anon, authenticated, service_role', t);
  end loop;
end $$;

insert into storage.buckets (id, name, public)
values ('purchase-photos', 'purchase-photos', true)
on conflict (id) do nothing;

drop policy if exists "purchase_photos_public_read" on storage.objects;
create policy "purchase_photos_public_read"
  on storage.objects for select
  using (bucket_id = 'purchase-photos');

drop policy if exists "purchase_photos_authenticated_insert" on storage.objects;
create policy "purchase_photos_authenticated_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'purchase-photos');

drop policy if exists "purchase_photos_authenticated_update" on storage.objects;
create policy "purchase_photos_authenticated_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'purchase-photos')
  with check (bucket_id = 'purchase-photos');

drop policy if exists "purchase_photos_authenticated_delete" on storage.objects;
create policy "purchase_photos_authenticated_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'purchase-photos');
