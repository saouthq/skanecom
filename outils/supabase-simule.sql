-- =====================================================================
-- SkanEcom · simulation de Supabase pour la base locale
-- =====================================================================
-- Exécuté par le superutilisateur `supabase_admin`, avant les migrations,
-- par outils/base-locale.sh. Il reproduit ce que Supabase fournit, et rien
-- de plus :
--   · `postgres` n'est PAS superutilisateur, comme chez Supabase : il
--     possède la base et joue les migrations et les tests. Une migration qui
--     demanderait un droit de superutilisateur échoue donc aussi en local ;
--   · les rôles `anon`, `authenticated` et `service_role` (ce dernier
--     contourne la RLS), dont `postgres` est membre, et `authenticator`, le
--     rôle de connexion de l'API (outils/api-locale.sh) ;
--   · le schéma `auth`, prêt pour les migrations de GoTrue, qui créent
--     auth.users, auth.uid(), auth.jwt()… comme sur Supabase ;
--   · le schéma `extensions` avec pgTAP, et les droits par défaut du schéma
--     `public`.
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
  -- Le rôle sous lequel l'API (PostgREST) se connecte, avant de prendre le
  -- rôle du jeton : anon, authenticated ou service_role.
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit;
  end if;
end
$$;

grant anon, authenticated, service_role to postgres;
grant anon, authenticated, service_role to authenticator;

create schema if not exists extensions authorization postgres;
grant usage on schema extensions to anon, authenticated, service_role;
create extension if not exists pgtap with schema extensions;

-- Le schéma `auth` : comme dans l'image Supabase, il appartient à
-- supabase_admin et GoTrue (le serveur d'authentification de Supabase) y crée
-- ses tables et ses fonctions (auth.users, auth.uid(), auth.jwt()…) sous le
-- rôle supabase_auth_admin — outils/base-locale.sh lance ses migrations juste
-- après ce fichier. `postgres` reçoit tous les droits sur ce que GoTrue crée,
-- comme chez Supabase (migration 20211115181400 de supabase/postgres).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    create role supabase_auth_admin noinherit createrole login noreplication;
  end if;
end
$$;

create schema if not exists auth authorization supabase_admin;
grant all privileges on schema auth to supabase_auth_admin;
alter role supabase_auth_admin set search_path = auth;
grant usage on schema auth to postgres, anon, authenticated, service_role;
alter default privileges for role supabase_auth_admin in schema auth grant all on tables    to postgres;
alter default privileges for role supabase_auth_admin in schema auth grant all on sequences to postgres;
alter default privileges for role supabase_auth_admin in schema auth grant all on routines  to postgres;

-- Droits par défaut du schéma public sur ce que crée `postgres`, comme chez
-- Supabase : la RLS, et elle seule, décide de ce que voient anon et
-- authenticated.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
