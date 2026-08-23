-- Rate Master — anon RLS policies (matches audit_fixes pattern for PIN-login clients)

drop policy if exists rate_master_config_anon_all on public.rate_master_config;
create policy rate_master_config_anon_all
  on public.rate_master_config for all to anon using (true) with check (true);

drop policy if exists rate_master_anon_all on public.rate_master;
create policy rate_master_anon_all
  on public.rate_master for all to anon using (true) with check (true);

notify pgrst, 'reload schema';
