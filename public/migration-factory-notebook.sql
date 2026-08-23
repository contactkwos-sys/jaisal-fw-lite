-- Digital Factory Notebook — run in Supabase SQL editor if migrations are not auto-applied.
-- Canonical copy: supabase/migrations/20260824120000_factory_notebook.sql

create table if not exists public.factory_notes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category text not null default 'General',
  machine_id text,
  priority text not null default 'Medium',
  assigned_to text,
  status text not null default 'Open',
  remarks text,
  reminder_date date,
  reminder_time time,
  din_id uuid references public.dins (id) on delete set null,
  din_ref text,
  note_type text not null default 'typed',
  created_by text,
  created_by_id uuid,
  updated_by text,
  updated_by_id uuid,
  deleted_by text,
  deleted_at timestamptz,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists factory_notes_created_at_idx on public.factory_notes (created_at desc);
create index if not exists factory_notes_machine_idx on public.factory_notes (machine_id) where is_deleted = false;
create index if not exists factory_notes_status_idx on public.factory_notes (status) where is_deleted = false;
create index if not exists factory_notes_category_idx on public.factory_notes (category) where is_deleted = false;
create index if not exists factory_notes_assigned_idx on public.factory_notes (assigned_to) where is_deleted = false;
create index if not exists factory_notes_din_idx on public.factory_notes (din_id) where din_id is not null;

create table if not exists public.factory_note_attachments (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.factory_notes (id) on delete cascade,
  file_url text not null,
  file_name text,
  file_type text,
  source text not null default 'gallery',
  category text,
  machine_id text,
  rotation_deg int not null default 0,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists factory_note_attachments_note_idx
  on public.factory_note_attachments (note_id, created_at);

create table if not exists public.factory_note_status_history (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.factory_notes (id) on delete cascade,
  old_status text,
  new_status text not null,
  changed_by text,
  remarks text,
  changed_at timestamptz not null default now()
);

create index if not exists factory_note_status_history_note_idx
  on public.factory_note_status_history (note_id, changed_at desc);

create table if not exists public.purchase_related_photos (
  id uuid primary key default gen_random_uuid(),
  purchase_type text not null,
  purchase_id uuid not null,
  file_url text not null,
  file_name text,
  file_type text,
  photo_category text not null default 'Other',
  source text not null default 'camera',
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists purchase_related_photos_purchase_idx
  on public.purchase_related_photos (purchase_type, purchase_id, created_at desc);

insert into storage.buckets (id, name, public)
values ('notebook-photos', 'notebook-photos', true)
on conflict (id) do nothing;

alter table public.factory_notes enable row level security;
alter table public.factory_note_attachments enable row level security;
alter table public.factory_note_status_history enable row level security;
alter table public.purchase_related_photos enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'factory_notes',
    'factory_note_attachments',
    'factory_note_status_history',
    'purchase_related_photos'
  ] loop
    execute format('drop policy if exists %I_all on public.%I', t, t);
    execute format(
      'create policy %I_all on public.%I for all to authenticated using (true) with check (true)',
      t, t
    );
  end loop;
end $$;

grant all on table public.factory_notes to anon, authenticated, service_role;
grant all on table public.factory_note_attachments to anon, authenticated, service_role;
grant all on table public.factory_note_status_history to anon, authenticated, service_role;
grant all on table public.purchase_related_photos to anon, authenticated, service_role;
