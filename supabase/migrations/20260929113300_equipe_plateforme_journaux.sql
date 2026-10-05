-- =====================================================================
-- L'ÉQUIPE SKANECOM, LE JOURNAL DE LA PLATEFORME, LE JOURNAL DES ENVOIS
--
-- · Deux rôles : super-administrateur (tout) et support (aider : lire,
--   ouvrir un accès support, noter, annoncer, cloner, renommer). Le
--   commercial et l'irréversible restent au super-administrateur :
--   formules, modules, statut d'une boutique, retrait d'un domaine,
--   l'équipe SkanEcom elle-même.
-- · Le journal de la plateforme : tout plateforme.journal_audit, filtré
--   par boutique, par genre de geste, paginé.
-- · Le journal des envois : chaque e-mail sorti (ou refusé) par le point
--   d'envoi unique de l'application, l'adresse masquée. Les SMS partent
--   par Supabase Auth : ils s'y ajouteront avec le fournisseur SMS.
-- =====================================================================

create function private.console_exige_super_admin(p_acteur uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if private.console_exige_admin(p_acteur) <> 'super_admin' then
    raise exception 'Seul un super-administrateur peut le faire : le rôle support aide, sans engager la boutique'
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

revoke execute on function private.console_exige_super_admin(uuid) from public, anon, authenticated;
grant  execute on function private.console_exige_super_admin(uuid) to service_role;

-- Le statut d'une boutique : super-administrateur seulement.
create or replace function public.console_changer_statut(p_acteur uuid, p_boutique_id uuid, p_statut text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_avant text;
begin
  perform private.console_exige_super_admin(p_acteur);
  select b.statut::text into v_avant from plateforme.boutiques b where b.id = p_boutique_id for update;
  if v_avant is null then
    raise exception 'Boutique introuvable' using errcode = 'no_data_found';
  end if;
  if v_avant = p_statut then
    return;
  end if;
  update plateforme.boutiques set statut = p_statut::plateforme.statut_boutique where id = p_boutique_id;
  perform private.console_trace(p_acteur, p_boutique_id, 'boutique.statut', p_statut,
    jsonb_build_object('statut', v_avant), jsonb_build_object('statut', p_statut));
end;
$$;


-- ---------------------------------------------------------------------
-- L'équipe SkanEcom
-- ---------------------------------------------------------------------
create function public.console_administrateurs(p_acteur uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.console_exige_admin(p_acteur);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'user_id', a.user_id, 'email', u.email, 'role', a.role, 'depuis', a.created_at,
             'derniere_connexion', u.last_sign_in_at, 'confirme', u.email_confirmed_at is not null,
             'double_auth', exists (select 1 from auth.mfa_factors f where f.user_id = a.user_id and f.status = 'verified'),
             'vous', a.user_id = p_acteur)
           order by a.role desc, u.email)
      from plateforme.administrateurs a join auth.users u on u.id = a.user_id), '[]'::jsonb);
end;
$$;

create function public.console_nommer_administrateur(p_acteur uuid, p_user_id uuid, p_role text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_avant text;
begin
  perform private.console_exige_super_admin(p_acteur);
  if p_role not in ('support', 'super_admin') then
    raise exception 'Rôle inconnu « % »', p_role using errcode = 'check_violation', hint = 'role';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'Compte introuvable' using errcode = 'no_data_found';
  end if;
  select a.role::text into v_avant from plateforme.administrateurs a where a.user_id = p_user_id;
  if v_avant = 'super_admin' and p_role <> 'super_admin'
     and (select count(*) from plateforme.administrateurs a where a.role = 'super_admin') = 1 then
    raise exception 'Il reste un seul super-administrateur : nommez-en un autre avant' using errcode = 'check_violation', hint = 'dernier';
  end if;
  insert into plateforme.administrateurs (user_id, role) values (p_user_id, p_role::plateforme.role_administrateur)
  on conflict (user_id) do update set role = excluded.role;
  perform private.console_trace(p_acteur, null, case when v_avant is null then 'administrateur.nommer' else 'administrateur.role' end,
    (select u.email from auth.users u where u.id = p_user_id), jsonb_build_object('role', v_avant), jsonb_build_object('role', p_role));
end;
$$;

create function public.console_retirer_administrateur(p_acteur uuid, p_user_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  perform private.console_exige_super_admin(p_acteur);
  select a.role::text into v_role from plateforme.administrateurs a where a.user_id = p_user_id;
  if v_role is null then
    raise exception 'Cette personne n''est pas de l''équipe SkanEcom' using errcode = 'no_data_found';
  end if;
  if p_user_id = p_acteur then
    raise exception 'On ne se retire pas soi-même : un autre super-administrateur le fera' using errcode = 'check_violation', hint = 'soi';
  end if;
  if v_role = 'super_admin' and (select count(*) from plateforme.administrateurs a where a.role = 'super_admin') = 1 then
    raise exception 'Il reste un seul super-administrateur' using errcode = 'check_violation', hint = 'dernier';
  end if;
  delete from plateforme.administrateurs where user_id = p_user_id;
  perform private.console_trace(p_acteur, null, 'administrateur.retirer', (select u.email from auth.users u where u.id = p_user_id),
    jsonb_build_object('role', v_role), null);
end;
$$;


-- ---------------------------------------------------------------------
-- Le journal de la plateforme
-- ---------------------------------------------------------------------
create function public.console_journal(p_acteur uuid, p_boutique_id uuid default null, p_genre text default null,
                                       p_limite integer default 50, p_decalage integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limite   integer := least(greatest(coalesce(p_limite, 50), 1), 200);
  v_decalage integer := greatest(coalesce(p_decalage, 0), 0);
  v_genre    text := nullif(btrim(coalesce(p_genre, '')), '');
begin
  perform private.console_exige_admin(p_acteur);
  return jsonb_build_object(
    'total', (select count(*) from plateforme.journal_audit j
               where (p_boutique_id is null or j.boutique_id = p_boutique_id)
                 and (v_genre is null or j.action like v_genre || '.%')),
    'lignes', coalesce((
      select jsonb_agg(x order by (x ->> 'id')::bigint desc) from (
        select jsonb_build_object(
                 'id', j.id, 'at', j.at, 'action', j.action, 'cible', j.cible, 'avant', j.avant, 'apres', j.apres,
                 'ip', host(j.ip),
                 'acteur', (select u.email from auth.users u where u.id = j.acteur),
                 'boutique', (select jsonb_build_object('slug', b.slug, 'nom', b.nom) from plateforme.boutiques b where b.id = j.boutique_id)) as x
          from plateforme.journal_audit j
         where (p_boutique_id is null or j.boutique_id = p_boutique_id)
           and (v_genre is null or j.action like v_genre || '.%')
         order by j.id desc
         limit v_limite offset v_decalage) t), '[]'::jsonb)
  );
end;
$$;


-- ---------------------------------------------------------------------
-- Le journal des envois
-- ---------------------------------------------------------------------
create table plateforme.envois (
  id          bigint generated always as identity primary key,
  le          timestamptz not null default now(),
  canal       text not null default 'email' check (canal in ('email', 'sms')),
  -- Masqué à l'écriture (« s•••@gmail.com ») : le journal dit qu'un envoi est parti, pas à qui en clair.
  destinataire text not null check (length(destinataire) <= 120),
  expediteur  text check (expediteur is null or length(expediteur) <= 120),
  sujet       text check (sujet is null or length(sujet) <= 200),
  fournisseur text not null check (length(fournisseur) <= 20),
  ok          boolean not null,
  raison      text check (raison is null or length(raison) <= 300)
);
create index envois_le on plateforme.envois (le desc);
alter table plateforme.envois enable row level security;

create function private.masquer_adresse(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p ~ '^[^@]+@[^@]+$' then left(split_part(p, '@', 1), 1) || '•••@' || split_part(p, '@', 2)
    when p ~ '^\+?[0-9 ]{6,}$' then '•••' || right(regexp_replace(p, '\D', '', 'g'), 3)
    else '•••'
  end;
$$;

create function public.console_noter_envoi(p_canal text, p_destinataire text, p_expediteur text, p_sujet text,
                                           p_fournisseur text, p_ok boolean, p_raison text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into plateforme.envois (canal, destinataire, expediteur, sujet, fournisseur, ok, raison)
  values (coalesce(nullif(p_canal, ''), 'email'), private.masquer_adresse(coalesce(p_destinataire, '')), left(p_expediteur, 120),
          left(p_sujet, 200), left(coalesce(nullif(p_fournisseur, ''), 'aucun'), 20), coalesce(p_ok, false), left(p_raison, 300));
  -- Trois mois suffisent pour savoir ce qui part et ce qui casse.
  delete from plateforme.envois where le < now() - interval '90 days';
$$;

create function public.console_envois(p_acteur uuid, p_echecs boolean default false, p_limite integer default 50, p_decalage integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limite   integer := least(greatest(coalesce(p_limite, 50), 1), 200);
  v_decalage integer := greatest(coalesce(p_decalage, 0), 0);
begin
  perform private.console_exige_admin(p_acteur);
  return jsonb_build_object(
    'total', (select count(*) from plateforme.envois e where not p_echecs or not e.ok),
    'semaine', jsonb_build_object(
      'partis', (select count(*) from plateforme.envois e where e.ok and e.le >= now() - interval '7 days'),
      'refuses', (select count(*) from plateforme.envois e where not e.ok and e.le >= now() - interval '7 days')),
    'lignes', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'le', e.le, 'canal', e.canal, 'destinataire', e.destinataire,
                                          'expediteur', e.expediteur, 'sujet', e.sujet, 'fournisseur', e.fournisseur,
                                          'ok', e.ok, 'raison', e.raison) order by e.id desc)
        from (select * from plateforme.envois e2 where not p_echecs or not e2.ok order by e2.id desc limit v_limite offset v_decalage) e), '[]'::jsonb)
  );
end;
$$;

revoke execute on function private.masquer_adresse(text) from public, anon, authenticated;
revoke execute on function public.console_administrateurs(uuid) from public, anon, authenticated;
revoke execute on function public.console_nommer_administrateur(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.console_retirer_administrateur(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.console_journal(uuid, uuid, text, integer, integer) from public, anon, authenticated;
revoke execute on function public.console_noter_envoi(text, text, text, text, text, boolean, text) from public, anon, authenticated;
revoke execute on function public.console_envois(uuid, boolean, integer, integer) from public, anon, authenticated;
grant  execute on function public.console_administrateurs(uuid) to service_role;
grant  execute on function public.console_nommer_administrateur(uuid, uuid, text) to service_role;
grant  execute on function public.console_retirer_administrateur(uuid, uuid) to service_role;
grant  execute on function public.console_journal(uuid, uuid, text, integer, integer) to service_role;
grant  execute on function public.console_noter_envoi(text, text, text, text, text, boolean, text) to service_role;
grant  execute on function public.console_envois(uuid, boolean, integer, integer) to service_role;
