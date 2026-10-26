-- Just enough of Supabase's own schema for our migrations to run on a plain Postgres: the auth.users table, the
-- auth.uid() function (same logic as Supabase: the user id comes from the request's JWT claims) and the three roles.
-- Like Supabase, the roles get full table privileges by default, so ROW LEVEL SECURITY is the only thing protecting rows.
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);

create function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'), '')::uuid
$$;

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public, auth to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
grant select on auth.users to service_role;
