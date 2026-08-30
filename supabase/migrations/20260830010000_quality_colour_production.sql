-- Quality Master, Colour Master, DIN Costing production/speed fields
-- Additive only. Does not alter Rate Master / Formula Master / Sales business logic.

-- ── Quality Master (recipe templates for DIN Costing) ──────────────────────
create table if not exists public.quality_master (
  id uuid primary key default gen_random_uuid(),
  quality_name text not null,
  is_active boolean not null default true,
  warp_base_denier numeric,
  weft_base_denier numeric,
  default_width numeric not null default 52,
  default_length_mtr numeric not null default 110,
  default_tar_ends numeric not null default 8900,
  -- JSON arrays of recipe rows (editable templates)
  -- warp: [{ yarn_name, base_denier, tar_ends? }]
  -- weft: [{ feeder_no?, colour?, weft_name, base_denier, pic? }]
  warp_recipe jsonb not null default '[]'::jsonb,
  weft_recipe jsonb not null default '[]'::jsonb,
  notes text,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint quality_master_name_unique unique (quality_name)
);

create index if not exists idx_quality_master_active
  on public.quality_master (lower(quality_name))
  where is_active = true;

alter table public.quality_master enable row level security;

drop policy if exists quality_master_authenticated_all on public.quality_master;
create policy quality_master_authenticated_all
  on public.quality_master for all to authenticated using (true) with check (true);

grant all on table public.quality_master to anon, authenticated, service_role;

comment on table public.quality_master is
  'Quality Name recipes — selecting a quality auto-fills Warp/Weft rows in DIN Costing (still editable)';

-- Seed example qualities when empty
do $$
begin
  if not exists (select 1 from public.quality_master limit 1) then
    insert into public.quality_master (
      quality_name, warp_base_denier, weft_base_denier,
      default_width, default_length_mtr, default_tar_ends,
      warp_recipe, weft_recipe
    ) values
      (
        '150 ROTO B & W',
        150, 150,
        52, 110, 8900,
        '[{"yarn_name":"150 Roto Black & White","base_denier":"150","tar_ends":"8900"}]'::jsonb,
        '[{"feeder_no":1,"colour":"White","weft_name":"","base_denier":""},{"feeder_no":2,"colour":"Black","weft_name":"","base_denier":""}]'::jsonb
      ),
      (
        'Candy',
        150, 150,
        52, 110, 8900,
        '[{"yarn_name":"150 Bright Yarn","base_denier":"150","tar_ends":"8900"}]'::jsonb,
        '[{"feeder_no":1,"colour":"","weft_name":"","base_denier":""}]'::jsonb
      );
  end if;
end $$;

-- ── Colour Master (dropdown for Weft Colour) ─────────────────────────────────
create table if not exists public.colour_master (
  id uuid primary key default gen_random_uuid(),
  colour_name text not null,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint colour_master_name_unique unique (colour_name)
);

create index if not exists idx_colour_master_active
  on public.colour_master (sort_order, lower(colour_name))
  where is_active = true;

alter table public.colour_master enable row level security;

drop policy if exists colour_master_authenticated_all on public.colour_master;
create policy colour_master_authenticated_all
  on public.colour_master for all to authenticated using (true) with check (true);

grant all on table public.colour_master to anon, authenticated, service_role;

do $$
begin
  if not exists (select 1 from public.colour_master limit 1) then
    insert into public.colour_master (colour_name, sort_order) values
      ('White', 1),
      ('Black', 2),
      ('Gold', 3),
      ('Silver', 4),
      ('Red', 5),
      ('Blue', 6),
      ('Green', 7),
      ('Yellow', 8),
      ('Maroon', 9),
      ('Others', 99);
  end if;
end $$;

-- ── Weft colour column (separate from feeder label) ──────────────────────────
alter table public.design_costing_weft
  add column if not exists colour text;

comment on column public.design_costing_weft.colour is
  'Colour name from Colour Master / OCR — separate from feeder_label and weft yarn';

-- ── Production / weaving speed + CEO profit efficiency on design_costing ─────
alter table public.design_costing
  add column if not exists machine_type text,
  add column if not exists machine_speed_rpm numeric,
  add column if not exists efficiency_pct numeric,
  add column if not exists quality_master_id uuid references public.quality_master(id);

comment on column public.design_costing.machine_type is
  'Machine type for Jacquard Repair production speed (editable)';
comment on column public.design_costing.machine_speed_rpm is
  'Machine speed RPM — default 450';
comment on column public.design_costing.efficiency_pct is
  'Weaving efficiency % — default 100; drives production & profit projections';
comment on column public.design_costing.quality_master_id is
  'Optional FK to Quality Master recipe used to seed this costing';
