-- Separate Design Master vs Order to Program — role-based write guards
-- Salesman may SELECT Design Master (DIN link) but must NOT modify master data.
-- Additive only; does not duplicate DIN tables.

create or replace function public.current_app_role_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select lower(trim(r.role_name))
      from public.users u
      join public.roles r on r.id = u.role_id
      where u.id = auth.uid()
      limit 1
    ),
    lower(trim(coalesce(auth.jwt() -> 'user_metadata' ->> 'role_name', ''))),
    lower(trim(coalesce(auth.jwt() -> 'user_metadata' ->> 'full_name', ''))),
    ''
  );
$$;

revoke all on function public.current_app_role_name() from public;
grant execute on function public.current_app_role_name() to anon, authenticated, service_role;

create or replace function public.is_design_master_writer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when public.current_app_role_name() in (
        'ceo', 'md', 'managing director', 'owner', 'manager', 'admin', 'design', 'design team'
      ) then true
      when public.current_app_role_name() like '%ceo%' then true
      when public.current_app_role_name() like '%director%' then true
      when public.current_app_role_name() like '%design%' then true
      when public.current_app_role_name() = '' then true -- legacy / service unlock when role unknown
      when public.current_app_role_name() like '%salesman%' then false
      when public.current_app_role_name() = 'sales' then false
      else false
    end;
$$;

revoke all on function public.is_design_master_writer() from public;
grant execute on function public.is_design_master_writer() to anon, authenticated, service_role;

create or replace function public.is_salesman_role()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_app_role_name() = 'salesman'
    or public.current_app_role_name() = 'sales'
    or public.current_app_role_name() like '%salesman%';
$$;

revoke all on function public.is_salesman_role() from public;
grant execute on function public.is_salesman_role() to anon, authenticated, service_role;

-- Replace open write policies on Design Master tables with role-aware ones.
-- Keep SELECT open so Order to Program can load DIN / rate / recipe by reference.
do $$
declare
  t text;
  tables text[] := array[
    'dins',
    'din_matchings',
    'din_sample_cards',
    'din_followups',
    'design_costing',
    'design_costing_warp',
    'design_costing_weft',
    'design_costing_audit',
    'din_formula_master',
    'rate_master',
    'rate_master_config',
    'design_warp',
    'design_weft'
  ];
begin
  foreach t in array tables
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);

    -- Drop broad authenticated/anon ALL policies if present
    execute format('drop policy if exists %I on public.%I', t || '_authenticated_all', t);
    execute format('drop policy if exists %I on public.%I', t || '_anon_all', t);
    execute format('drop policy if exists %I on public.%I', 'authenticated_all_' || t, t);
    execute format('drop policy if exists %I on public.%I', t || '_all', t);

    -- SELECT for authenticated + anon (PIN login path)
    execute format('drop policy if exists %I on public.%I', t || '_select_all', t);
    execute format(
      'create policy %I on public.%I for select to authenticated, anon using (true)',
      t || '_select_all', t
    );

    -- INSERT / UPDATE / DELETE only for Design Master writers (blocks salesman)
    execute format('drop policy if exists %I on public.%I', t || '_write_design', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated, anon with check (public.is_design_master_writer())',
      t || '_write_design', t
    );
    execute format('drop policy if exists %I on public.%I', t || '_update_design', t);
    execute format(
      'create policy %I on public.%I for update to authenticated, anon using (public.is_design_master_writer()) with check (public.is_design_master_writer())',
      t || '_update_design', t
    );
    execute format('drop policy if exists %I on public.%I', t || '_delete_design', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated, anon using (public.is_design_master_writer())',
      t || '_delete_design', t
    );
  end loop;
end $$;

-- Rename Design Master module PIN label when present (do not insert incomplete PIN rows)
do $$
begin
  if to_regclass('public.module_pins') is null then
    return;
  end if;
  update public.module_pins
  set module_name = 'Design Master'
  where module_key = 'design-to-order'
    and module_name is distinct from 'Design Master';
exception
  when others then
    null;
end $$;

comment on function public.is_design_master_writer() is
  'True for CEO/Manager/Design — false for Salesman. Guards Design Master write RLS.';
comment on function public.is_salesman_role() is
  'True when JWT / users.roles is Salesman.';

-- Allow Order to Program to mark DIN as Order Booked without granting full Design Master write
create or replace function public.mark_din_order_booked(p_din_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_din_id is null then
    return;
  end if;
  update public.dins
  set
    status = case
      when status in ('Dispatched', 'Closed', 'In Production', 'Order Booked') then status
      else 'Order Booked'
    end,
    updated_at = now()
  where id = p_din_id;
end;
$$;

revoke all on function public.mark_din_order_booked(uuid) from public;
grant execute on function public.mark_din_order_booked(uuid) to anon, authenticated, service_role;
