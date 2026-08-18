-- Mirror of supabase/migrations/20260818000100_design_catalog.sql
-- Design Catalog (DNA) — phase 1

create sequence if not exists public.design_catalog_design_no_seq
  as integer
  start with 1
  increment by 1
  minvalue 1
  no maxvalue
  cache 1;

create table if not exists public.design_catalog (
  id uuid primary key default gen_random_uuid(),
  design_no integer not null default nextval('public.design_catalog_design_no_seq'),
  jfg_no text not null,
  design_image_url text not null,
  matching_image_url text not null,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid,
  constraint design_catalog_design_no_unique unique (design_no),
  constraint design_catalog_design_no_positive check (design_no >= 1)
);

alter sequence public.design_catalog_design_no_seq owned by public.design_catalog.design_no;

create index if not exists idx_design_catalog_design_no on public.design_catalog (design_no);
create index if not exists idx_design_catalog_jfg_lower on public.design_catalog (lower(jfg_no));
create index if not exists idx_design_catalog_created_at on public.design_catalog (created_at desc);

alter table public.design_catalog enable row level security;

drop policy if exists design_catalog_authenticated_all on public.design_catalog;
create policy design_catalog_authenticated_all
  on public.design_catalog
  for all
  to authenticated
  using (true)
  with check (true);

grant all on table public.design_catalog to anon, authenticated, service_role;
grant usage, select, update on sequence public.design_catalog_design_no_seq to anon, authenticated, service_role;

insert into storage.buckets (id, name, public)
values ('design-catalog-images', 'design-catalog-images', true)
on conflict (id) do nothing;

drop policy if exists "design_catalog_images_public_read" on storage.objects;
create policy "design_catalog_images_public_read"
  on storage.objects for select
  using (bucket_id = 'design-catalog-images');

drop policy if exists "design_catalog_images_authenticated_insert" on storage.objects;
create policy "design_catalog_images_authenticated_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'design-catalog-images');

drop policy if exists "design_catalog_images_authenticated_update" on storage.objects;
create policy "design_catalog_images_authenticated_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'design-catalog-images')
  with check (bucket_id = 'design-catalog-images');

drop policy if exists "design_catalog_images_authenticated_delete" on storage.objects;
create policy "design_catalog_images_authenticated_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'design-catalog-images');
