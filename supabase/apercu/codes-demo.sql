-- =====================================================================
-- SkanEcom — APERÇU EN LIGNE SEULEMENT : les codes de connexion, lus dans
-- la console au lieu d'être envoyés
-- =====================================================================
-- ⚠️ JAMAIS SUR LA PRODUCTION. Ce fichier n'est pas une migration : il se
-- joue sur le projet Supabase de l'aperçu (celui où Skander essaie les
-- boutiques de démo), qui n'a ni fournisseur de SMS ni expéditeur
-- d'e-mails.
--
-- Supabase Auth confie les codes à deux crochets Postgres (Authentication →
-- Hooks : « Send SMS » → private.crochet_sms_apercu, « Send Email » →
-- private.crochet_email_apercu). Ils notent le code au lieu de l'envoyer ;
-- la console les montre à l'administrateur (public.console_codes_apercu),
-- une heure au plus. Même rôle que le relais en local (outils/relais-rest.mjs).
-- =====================================================================

create table if not exists plateforme.codes_apercu (
  id           bigint generated always as identity primary key,
  le           timestamptz not null default now(),
  canal        text not null check (canal in ('sms', 'email')),
  destinataire text not null,
  code         text not null,
  motif        text
);
comment on table plateforme.codes_apercu is
  'APERÇU SEULEMENT : les codes de connexion que Supabase Auth aurait envoyés. Gardés une heure.';

create or replace function private.crochet_sms_apercu(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from plateforme.codes_apercu where le < now() - interval '1 hour';
  insert into plateforme.codes_apercu (canal, destinataire, code)
  values ('sms', '+' || ltrim(coalesce(event #>> '{user,phone}', ''), '+'), coalesce(event #>> '{sms,otp}', ''));
  return '{}'::jsonb;
end;
$$;

create or replace function private.crochet_email_apercu(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from plateforme.codes_apercu where le < now() - interval '1 hour';
  insert into plateforme.codes_apercu (canal, destinataire, code, motif)
  values ('email', lower(coalesce(event #>> '{user,email}', '')), coalesce(event #>> '{email_data,token}', ''),
          event #>> '{email_data,email_action_type}');
  return '{}'::jsonb;
end;
$$;

-- Les crochets ne sont appelés que par Supabase Auth.
grant usage on schema private to supabase_auth_admin;
revoke execute on function private.crochet_sms_apercu(jsonb)   from public, anon, authenticated;
revoke execute on function private.crochet_email_apercu(jsonb) from public, anon, authenticated;
grant  execute on function private.crochet_sms_apercu(jsonb)   to supabase_auth_admin;
grant  execute on function private.crochet_email_apercu(jsonb) to supabase_auth_admin;

-- La console (clé service_role, administrateur en double authentification) :
-- les codes de la dernière heure, les plus récents d'abord.
create or replace function public.console_codes_apercu()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('le', c.le, 'canal', c.canal, 'destinataire', c.destinataire, 'code', c.code)
                            order by c.le desc), '[]'::jsonb)
    from (select * from plateforme.codes_apercu where le > now() - interval '1 hour' order by le desc limit 30) c;
$$;
revoke execute on function public.console_codes_apercu() from public, anon, authenticated;
grant  execute on function public.console_codes_apercu() to service_role;
