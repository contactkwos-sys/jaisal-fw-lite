-- Design Wise Costing module + PIC conversion rate extensions
-- Mirror of supabase/migrations/20260817000800_design_wise_costing.sql
-- and 20260821000200_design_wise_costing_pic_rate.sql

create table if not exists public.design_costing (
  id uuid primary key default gen_random_uuid(),
  din_number text not null,
  quality_name text,
  costing_date date not null default current_date,
  diary_image_url text,

  conversion_charge numeric not null default 0,
  mu_percent numeric not null default 5,
  gst_percent numeric not null default 5,

  total_weight_kg numeric,
  total_yarn_amount numeric,
  yarn_cost_per_mtr numeric,
  subtotal_per_mtr numeric,
  after_mu_per_mtr numeric,
  final_cost_per_mtr numeric,

  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create table if not exists public.design_costing_warp (
  id uuid primary key default gen_random_uuid(),
  costing_id uuid not null references public.design_costing(id) on delete cascade,
  sr_no int not null,
  yarn_name text,
  denier numeric,
  tar_ends numeric,
  length_mtr numeric,
  weight_kg numeric generated always as (
    case
      when denier is null or tar_ends is null or length_mtr is null then null
      else (denier * tar_ends * length_mtr) / 9000000.0
    end
  ) stored,
  rate_per_kg numeric,
  amount numeric generated always as (
    case
      when denier is null or tar_ends is null or length_mtr is null or rate_per_kg is null then null
      else ((denier * tar_ends * length_mtr) / 9000000.0) * rate_per_kg
    end
  ) stored
);

create table if not exists public.design_costing_weft (
  id uuid primary key default gen_random_uuid(),
  costing_id uuid not null references public.design_costing(id) on delete cascade,
  sr_no int not null,
  weft_name text,
  denier numeric,
  pic numeric,
  width numeric,
  length_mtr numeric,
  weight_kg numeric generated always as (
    case
      when denier is null or pic is null or width is null or length_mtr is null then null
      else (denier * pic * width * length_mtr) / 9000000.0
    end
  ) stored,
  rate_per_kg numeric,
  amount numeric generated always as (
    case
      when denier is null or pic is null or width is null or length_mtr is null or rate_per_kg is null then null
      else ((denier * pic * width * length_mtr) / 9000000.0) * rate_per_kg
    end
  ) stored
);

create index if not exists idx_design_costing_din on public.design_costing (din_number);
create index if not exists idx_design_costing_warp_costing on public.design_costing_warp (costing_id);
create index if not exists idx_design_costing_weft_costing on public.design_costing_weft (costing_id);

alter table public.design_costing enable row level security;
alter table public.design_costing_warp enable row level security;
alter table public.design_costing_weft enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['design_costing', 'design_costing_warp', 'design_costing_weft']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_authenticated_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      t || '_authenticated_all', t
    );
  end loop;
end $$;

grant all on table public.design_costing to anon, authenticated, service_role;
grant all on table public.design_costing_warp to anon, authenticated, service_role;
grant all on table public.design_costing_weft to anon, authenticated, service_role;

insert into storage.buckets (id, name, public)
values ('costing-diary-images', 'costing-diary-images', true)
on conflict (id) do nothing;

drop policy if exists "costing_diary_images_public_read" on storage.objects;
create policy "costing_diary_images_public_read"
  on storage.objects for select
  using (bucket_id = 'costing-diary-images');

drop policy if exists "costing_diary_images_authenticated_insert" on storage.objects;
create policy "costing_diary_images_authenticated_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'costing-diary-images');

drop policy if exists "costing_diary_images_authenticated_update" on storage.objects;
create policy "costing_diary_images_authenticated_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'costing-diary-images')
  with check (bucket_id = 'costing-diary-images');

drop policy if exists "costing_diary_images_authenticated_delete" on storage.objects;
create policy "costing_diary_images_authenticated_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'costing-diary-images');

-- Extensions: design length, PIC rate vs charge, totals, status, audit
alter table public.design_costing
  add column if not exists design_length_mtr numeric,
  add column if not exists pic_conversion_rate numeric not null default 0.45,
  add column if not exists total_pic numeric,
  add column if not exists total_warp_weight_kg numeric,
  add column if not exists total_weft_weight_kg numeric,
  add column if not exists total_warp_amount numeric,
  add column if not exists total_weft_amount numeric,
  add column if not exists gst_amount numeric,
  add column if not exists status text not null default 'draft',
  add column if not exists updated_by uuid references auth.users(id),
  add column if not exists updated_at timestamptz default now();

update public.design_costing
set pic_conversion_rate = conversion_charge
where conversion_charge is not null
  and conversion_charge > 0
  and conversion_charge <= 10
  and (pic_conversion_rate is null or pic_conversion_rate = 0.45);

update public.design_costing dc
set
  design_length_mtr = coalesce(dc.design_length_mtr, (
    select coalesce(
      (select max(length_mtr) from public.design_costing_weft w where w.costing_id = dc.id),
      (select max(length_mtr) from public.design_costing_warp w where w.costing_id = dc.id)
    )
  )),
  total_pic = coalesce(dc.total_pic, (
    select coalesce(sum(pic), 0) from public.design_costing_weft w where w.costing_id = dc.id
  )),
  total_warp_weight_kg = coalesce(dc.total_warp_weight_kg, (
    select coalesce(sum(weight_kg), 0) from public.design_costing_warp w where w.costing_id = dc.id
  )),
  total_weft_weight_kg = coalesce(dc.total_weft_weight_kg, (
    select coalesce(sum(weight_kg), 0) from public.design_costing_weft w where w.costing_id = dc.id
  )),
  total_warp_amount = coalesce(dc.total_warp_amount, (
    select coalesce(sum(amount), 0) from public.design_costing_warp w where w.costing_id = dc.id
  )),
  total_weft_amount = coalesce(dc.total_weft_amount, (
    select coalesce(sum(amount), 0) from public.design_costing_weft w where w.costing_id = dc.id
  )),
  gst_amount = coalesce(
    dc.gst_amount,
    case
      when dc.after_mu_per_mtr is not null and dc.gst_percent is not null
        then round((dc.after_mu_per_mtr * dc.gst_percent / 100.0)::numeric, 2)
      else null
    end
  ),
  updated_at = coalesce(dc.updated_at, dc.created_at)
where dc.design_length_mtr is null
   or dc.total_pic is null
   or dc.gst_amount is null
   or dc.updated_at is null;

alter table public.design_costing
  drop constraint if exists design_costing_status_check;

alter table public.design_costing
  add constraint design_costing_status_check
  check (status in ('draft', 'final'));
