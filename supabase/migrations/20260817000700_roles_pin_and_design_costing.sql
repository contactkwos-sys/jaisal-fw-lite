-- Roles & PIN load hardening + Design Master costing summary columns

-- Login / Roles screens: allow anon SELECT on roles (RLS previously blocked
-- unauthenticated list; Admin still uses authenticated policy).
drop policy if exists "roles_anon_select" on public.roles;
create policy "roles_anon_select"
  on public.roles for select to anon
  using (true);

-- Design Master Phase-1 costing fields on designs header
alter table public.designs
  add column if not exists cost_per_meter numeric,
  add column if not exists matching_cost numeric,
  add column if not exists total_cost numeric;
