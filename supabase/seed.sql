-- Demo auth users + public.users (PIN for all: 1234)
-- Run after migration, with service role / SQL editor that can write auth.users.
-- pin_hash = PBKDF2-SHA256, 100000 iterations, salt "jaisal-demo-salt-01"

create extension if not exists pgcrypto;

do $$
declare
  ceo_role uuid;
  prog_role uuid;
  sec_role uuid;
  op_role uuid;
  ceo_id uuid := '11111111-1111-1111-1111-111111111111';
  prog_id uuid := '22222222-2222-2222-2222-222222222222';
  sec_id uuid := '33333333-3333-3333-3333-333333333333';
  op_id uuid := '44444444-4444-4444-4444-444444444444';
  pin_hash text := 'pbkdf2$sha256$100000$amFpc2FsLWRlbW8tc2FsdC0wMQ==$HFPLoo480eh3bBItYzDgZVhvJtkQKB/n6YeAZEpuPxU=';
begin
  select id into ceo_role from public.roles where role_name = 'CEO';
  select id into prog_role from public.roles where role_name = 'Programmer';
  select id into sec_role from public.roles where role_name = 'Security';
  select id into op_role from public.roles where role_name = 'Operator';

  -- auth.users rows (local/dev seed shape; adjust if your Supabase version differs)
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change
  )
  values
    (ceo_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'ceo@jaisal.local', crypt('unused', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{"full_name":"CEO"}',
     now(), now(), '', '', '', ''),
    (prog_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'programmer@jaisal.local', crypt('unused', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{"full_name":"Programmer"}',
     now(), now(), '', '', '', ''),
    (sec_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'security@jaisal.local', crypt('unused', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{"full_name":"Security"}',
     now(), now(), '', '', '', ''),
    (op_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'operator@jaisal.local', crypt('unused', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{"full_name":"Operator"}',
     now(), now(), '', '', '', '')
  on conflict (id) do nothing;

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  )
  values
    (ceo_id, ceo_id, format('{"sub":"%s","email":"ceo@jaisal.local"}', ceo_id)::jsonb, 'email', ceo_id::text, now(), now(), now()),
    (prog_id, prog_id, format('{"sub":"%s","email":"programmer@jaisal.local"}', prog_id)::jsonb, 'email', prog_id::text, now(), now(), now()),
    (sec_id, sec_id, format('{"sub":"%s","email":"security@jaisal.local"}', sec_id)::jsonb, 'email', sec_id::text, now(), now(), now()),
    (op_id, op_id, format('{"sub":"%s","email":"operator@jaisal.local"}', op_id)::jsonb, 'email', op_id::text, now(), now(), now())
  on conflict do nothing;

  insert into public.users (id, full_name, role_id, pin_hash, is_active)
  values
    (ceo_id, 'CEO', ceo_role, pin_hash, true),
    (prog_id, 'Programmer', prog_role, pin_hash, true),
    (sec_id, 'Security', sec_role, pin_hash, true),
    (op_id, 'Operator', op_role, pin_hash, true)
  on conflict (id) do nothing;

  insert into public.workers (full_name, department, is_active)
  select * from (values
    ('Ramesh Kumar', 'Weaving', true),
    ('Suresh Patel', 'Warping', true),
    ('Anita Shah', 'Quality', true)
  ) as v(full_name, department, is_active)
  where not exists (select 1 from public.workers limit 1);
end $$;
