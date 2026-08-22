-- Gmail DESIGN Intake — OAuth tokens, approved senders, import tracking, audit log.
-- Additive only. Does not duplicate dins / design_costing tables.

-- Extend gmail_connections for real OAuth (tokens stored server-side only).
alter table public.gmail_connections
  add column if not exists connected_email text,
  add column if not exists refresh_token_encrypted text,
  add column if not exists access_token_encrypted text,
  add column if not exists token_expires_at timestamptz,
  add column if not exists scopes text,
  add column if not exists oauth_state text,
  add column if not exists last_sync_at timestamptz,
  add column if not exists connected_by uuid references auth.users(id);

-- Approved design senders — CEO configures email addresses (names seeded, emails added in admin).
create table if not exists public.gmail_approved_senders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_gmail_senders_email_lower
  on public.gmail_approved_senders (lower(trim(email)))
  where email is not null and trim(email) <> '';

-- Duplicate protection: one import per Gmail message + attachment.
create table if not exists public.gmail_design_imports (
  id uuid primary key default gen_random_uuid(),
  gmail_message_id text not null,
  gmail_attachment_id text not null,
  din_id uuid references public.dins(id) on delete set null,
  sender_email text not null,
  sender_name text,
  subject text,
  received_at timestamptz not null,
  attachment_filename text not null,
  attachment_mime text,
  image_url text,
  imported_by uuid references auth.users(id),
  imported_at timestamptz not null default now(),
  unique (gmail_message_id, gmail_attachment_id)
);

create index if not exists idx_gmail_imports_din on public.gmail_design_imports (din_id);
create index if not exists idx_gmail_imports_received on public.gmail_design_imports (received_at desc);

-- Audit log for connect / disconnect / import / list.
create table if not exists public.gmail_audit_log (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  user_id uuid references auth.users(id),
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_gmail_audit_created on public.gmail_audit_log (created_at desc);

-- Optional Gmail reference on DIN master for audit (nullable).
alter table public.dins
  add column if not exists gmail_message_id text,
  add column if not exists gmail_attachment_id text,
  add column if not exists gmail_import_id uuid references public.gmail_design_imports(id) on delete set null;

-- Seed approved sender names (CEO adds email addresses in Admin).
insert into public.gmail_approved_senders (name, email, is_active)
select v.name, null, true
from (values ('Gopal Asra'), ('Aditya Graphics')) as v(name)
where not exists (
  select 1 from public.gmail_approved_senders s where lower(s.name) = lower(v.name)
);

alter table public.gmail_approved_senders enable row level security;
alter table public.gmail_design_imports enable row level security;
alter table public.gmail_audit_log enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['gmail_approved_senders', 'gmail_design_imports', 'gmail_audit_log']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_authenticated_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      t || '_authenticated_all', t
    );
  end loop;
end $$;

grant all on table public.gmail_approved_senders to anon, authenticated, service_role;
grant all on table public.gmail_design_imports to anon, authenticated, service_role;
grant all on table public.gmail_audit_log to anon, authenticated, service_role;
