-- Design Broadcast + Party Master

create table if not exists public.design_broadcasts (
  id uuid primary key default gen_random_uuid(),
  design_id uuid references public.designs (id) on delete set null,
  main_photo_url text,
  colour_chart_url text,
  caption text,
  created_at timestamptz not null default now()
);

create table if not exists public.party_master (
  id uuid primary key default gen_random_uuid(),
  party_name text not null,
  created_at timestamptz not null default now(),
  constraint party_master_party_name_unique unique (party_name)
);

create index if not exists idx_design_broadcasts_design on public.design_broadcasts (design_id);
create index if not exists idx_party_master_name_lower on public.party_master (lower(party_name));

alter table public.design_broadcasts enable row level security;
alter table public.party_master enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['design_broadcasts', 'party_master']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_authenticated_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      t || '_authenticated_all', t
    );
  end loop;
end $$;

grant all on table public.design_broadcasts to anon, authenticated, service_role;
grant all on table public.party_master to anon, authenticated, service_role;
