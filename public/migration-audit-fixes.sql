-- ERP audit fixes: order_book_items timestamps + ensure Design to Order tables exist
-- Additive only — does not drop data.

-- ---------- order_book_items.created_at (used by Program to Production ordering) ----------
alter table public.order_book_items
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- Backfill from parent order header when possible
update public.order_book_items obi
set created_at = ob.created_at,
    updated_at = ob.created_at
from public.order_book ob
where obi.order_id = ob.id
  and obi.created_at = obi.updated_at;

create index if not exists idx_order_book_items_created_at
  on public.order_book_items (created_at desc);

-- ---------- Ensure dins hub exists (schema cache / missing migration recovery) ----------
create table if not exists public.dins (
  id uuid primary key default gen_random_uuid(),
  din_number text unique not null,
  received_date date not null default current_date,
  design_name text,
  party_name text,
  din_image_url text,
  common_warp text,
  remarks text,
  status text not null default 'DIN Received',
  matching_count int not null default 0,
  costing_id uuid references public.design_costing(id) on delete set null,
  costing_status text not null default 'Pending',
  costing_date date,
  costing_version int not null default 0,
  base_cost_per_mtr numeric,
  gst_percent numeric,
  gst_amount numeric,
  final_cost_per_mtr numeric,
  source text not null default 'upload',
  source_email text,
  source_email_from text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.din_matchings (
  id uuid primary key default gen_random_uuid(),
  din_id uuid not null references public.dins(id) on delete cascade,
  matching_no int not null,
  ground_colour text,
  weft_1 text,
  weft_2 text,
  weft_3 text,
  weft_4 text,
  common_warp text,
  remarks text,
  status text not null default 'Pending',
  sample_photo_url text,
  approved_photo_url text,
  sample_produced_at timestamptz,
  sample_received_date date,
  sample_received_by text,
  actual_meter numeric,
  created_at timestamptz not null default now(),
  unique (din_id, matching_no)
);

create table if not exists public.din_sample_cards (
  id uuid primary key default gen_random_uuid(),
  din_id uuid not null references public.dins(id) on delete cascade,
  sample_job_card_id uuid references public.sample_job_cards(id) on delete set null,
  card_no text not null,
  matching_nos int[] not null default '{}',
  machine_no text,
  job_date date not null default current_date,
  shift text,
  operator_name text,
  supervisor_name text,
  warp text,
  weft_colours text,
  required_meter numeric,
  remarks text,
  status text not null default 'Issued',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.din_followups (
  id uuid primary key default gen_random_uuid(),
  din_id uuid references public.dins(id) on delete cascade,
  din_number text,
  party_name text,
  followup_date date not null default current_date,
  reminder_note text,
  status text not null default 'open',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- Gmail columns (additive)
alter table public.dins
  add column if not exists gmail_message_id text,
  add column if not exists gmail_attachment_id text,
  add column if not exists gmail_import_id uuid;

alter table public.order_book_items
  add column if not exists din_id uuid references public.dins(id) on delete set null,
  add column if not exists matching_no int,
  add column if not exists delivery_requirement text;

create index if not exists idx_dins_din_number on public.dins (din_number);
create index if not exists idx_dins_status on public.dins (status);
create index if not exists idx_order_book_items_din on public.order_book_items (din_id);

alter table public.dins enable row level security;
alter table public.din_matchings enable row level security;
alter table public.din_sample_cards enable row level security;
alter table public.din_followups enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['dins', 'din_matchings', 'din_sample_cards', 'din_followups']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_authenticated_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      t || '_authenticated_all', t
    );
    execute format('drop policy if exists %I on public.%I', t || '_anon_all', t);
    execute format(
      'create policy %I on public.%I for all to anon using (true) with check (true)',
      t || '_anon_all', t
    );
  end loop;
end $$;

grant all on table public.dins to anon, authenticated, service_role;
grant all on table public.din_matchings to anon, authenticated, service_role;
grant all on table public.din_sample_cards to anon, authenticated, service_role;
grant all on table public.din_followups to anon, authenticated, service_role;

-- Refresh PostgREST schema cache
notify pgrst, 'reload schema';
