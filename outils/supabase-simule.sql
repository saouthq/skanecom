-- =====================================================================
-- SkanEcom · simulation de Supabase pour la base locale
-- =====================================================================
-- Supabase fournit, avant nos migrations, des rôles, un schéma `auth` et des
-- droits par défaut. Sur un Postgres ordinaire, ce fichier reproduit le
-- strict nécessaire, et rien de plus :
--   · les rôles `anon`, `authenticated` et `service_role` (ce dernier
--     contourne la RLS, comme chez Supabase) ;
--   · `auth.users` réduite aux colonnes que nous utilisons ;
--   · `auth.uid()`, `auth.role()` et `auth.jwt()`, qui lisent les claims du
--     jeton dans `request.jwt.claims`, exactement comme PostgREST les pose ;
--   · le schéma `extensions` et les droits par défaut du schéma `public`.
--
-- Il n'est JAMAIS appliqué sur Supabase. La CI rejoue les mêmes tests sur la
-- vraie image Supabase : un écart entre cette simulation et Supabase y
-- apparaît aussitôt.
-- =====================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id                 uuid primary key,
  email              text,
  phone              text,
  raw_user_meta_data jsonb,
  raw_app_meta_data  jsonb,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

grant execute on function auth.uid(), auth.role(), auth.jwt() to anon, authenticated, service_role;

-- Droits par défaut du schéma public, comme chez Supabase : la RLS, et elle
-- seule, décide de ce que voient anon et authenticated.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
