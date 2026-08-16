-- Required: tables were created without privileges for API roles
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- verify
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'roles'
order by grantee, privilege_type;
