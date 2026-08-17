-- Sample Job Card module

create table if not exists public.sample_job_cards (
  id uuid primary key default gen_random_uuid(),
  din_number text unique not null default '', -- filled by trigger as DIN-XXXX
  design_image_url text,                  -- Supabase Storage path / public URL
  job_date date not null default current_date,
  machine_no text,
  work_quality text,
  status text not null default 'pending', -- pending / done
  done_date date,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create table if not exists public.sample_matchings (
  id uuid primary key default gen_random_uuid(),
  job_card_id uuid references public.sample_job_cards(id) on delete cascade,
  matching_no int not null,
  created_at timestamptz default now()
);

create table if not exists public.sample_matching_colours (
  id uuid primary key default gen_random_uuid(),
  matching_id uuid references public.sample_matchings(id) on delete cascade,
  colour_name text not null,
  colour_number text not null,
  sort_order int default 0
);

create index if not exists idx_sample_matchings_job on public.sample_matchings (job_card_id);
create index if not exists idx_sample_matching_colours_matching on public.sample_matching_colours (matching_id);
create index if not exists idx_sample_job_cards_status on public.sample_job_cards (status);

-- Auto DIN number: DIN-1001, DIN-1002... (current max + 1)
create or replace function public.fn_sample_job_card_set_din()
returns trigger
language plpgsql
as $$
declare
  max_n int;
begin
  if new.din_number is not null and btrim(new.din_number) <> '' then
    return new;
  end if;

  select coalesce(
    max((regexp_match(din_number, '(\d+)$'))[1]::int),
    1000
  )
  into max_n
  from public.sample_job_cards;

  new.din_number := 'DIN-' || (max_n + 1)::text;
  return new;
end;
$$;

drop trigger if exists trg_sample_job_card_set_din on public.sample_job_cards;
create trigger trg_sample_job_card_set_din
before insert on public.sample_job_cards
for each row execute function public.fn_sample_job_card_set_din();

-- RLS (same pattern as design_master tables)
alter table public.sample_job_cards enable row level security;
alter table public.sample_matchings enable row level security;
alter table public.sample_matching_colours enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['sample_job_cards', 'sample_matchings', 'sample_matching_colours']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_authenticated_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      t || '_authenticated_all', t
    );
  end loop;
end $$;

grant all on table public.sample_job_cards to anon, authenticated, service_role;
grant all on table public.sample_matchings to anon, authenticated, service_role;
grant all on table public.sample_matching_colours to anon, authenticated, service_role;

-- Storage bucket: sample-designs (public read, authenticated write)
insert into storage.buckets (id, name, public)
values ('sample-designs', 'sample-designs', true)
on conflict (id) do nothing;

drop policy if exists "sample_designs_public_read" on storage.objects;
create policy "sample_designs_public_read"
  on storage.objects for select
  using (bucket_id = 'sample-designs');

drop policy if exists "sample_designs_authenticated_insert" on storage.objects;
create policy "sample_designs_authenticated_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'sample-designs');

drop policy if exists "sample_designs_authenticated_update" on storage.objects;
create policy "sample_designs_authenticated_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'sample-designs')
  with check (bucket_id = 'sample-designs');

drop policy if exists "sample_designs_authenticated_delete" on storage.objects;
create policy "sample_designs_authenticated_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'sample-designs');
