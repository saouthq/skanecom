-- =====================================================================
-- LA CONSOLE, LOT 3 — ce qui manquait pour l'exploiter au quotidien
--
-- · Réinitialiser la double authentification d'une personne qui a perdu
--   son téléphone (équipe SkanEcom ou propriétaire d'une boutique) : ses
--   facteurs et ses sessions tombent ; à la prochaine connexion, elle
--   enregistre de nouveau son application. Super-administrateur seulement,
--   jamais pour soi.
-- · Une note de suivi peut porter une date de rappel : le jour venu, elle
--   remonte dans « À surveiller » jusqu'à ce qu'on la dise faite.
-- · Le journal se filtre par période et s'exporte (jusqu'à 5 000 lignes).
-- =====================================================================

-- ---------------------------------------------------------------------
-- La double authentification, réinitialisée
-- ---------------------------------------------------------------------
create function public.console_reinitialiser_double_auth(p_acteur uuid, p_user_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_email    text;
  v_facteurs integer;
begin
  perform private.console_exige_super_admin(p_acteur);
  if p_user_id = p_acteur then
    raise exception 'On ne réinitialise pas sa propre double authentification : un autre super-administrateur le fera'
      using errcode = 'check_violation', hint = 'soi';
  end if;
  select u.email into v_email from auth.users u where u.id = p_user_id;
  if v_email is null then
    raise exception 'Compte introuvable' using errcode = 'no_data_found';
  end if;
  delete from auth.mfa_factors f where f.user_id = p_user_id;
  get diagnostics v_facteurs = row_count;
  -- Ses sessions tombent aussi : un téléphone perdu ne reste pas connecté.
  delete from auth.sessions s where s.user_id = p_user_id;
  perform private.console_trace(p_acteur, null, 'administrateur.double_auth', v_email, null, jsonb_build_object('facteurs', v_facteurs));
  return v_facteurs;
end;
$$;

revoke execute on function public.console_reinitialiser_double_auth(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.console_reinitialiser_double_auth(uuid, uuid) to service_role;


-- ---------------------------------------------------------------------
-- Les notes de suivi : une date de rappel
-- ---------------------------------------------------------------------
alter table plateforme.notes_boutique
  add column rappel date,
  add column rappel_fait_le timestamptz;

create index notes_boutique_rappels on plateforme.notes_boutique (rappel) where rappel is not null and rappel_fait_le is null;

create or replace function public.console_notes(p_acteur uuid, p_boutique_id uuid)
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
             'id', n.id, 'texte', n.texte, 'epinglee', n.epinglee, 'le', n.created_at,
             'rappel', n.rappel, 'rappel_fait_le', n.rappel_fait_le,
             'auteur', (select u.email from auth.users u where u.id = n.auteur), 'vous', n.auteur = p_acteur)
           order by n.epinglee desc, n.created_at desc, n.id desc)
      from plateforme.notes_boutique n where n.boutique_id = p_boutique_id), '[]'::jsonb);
end;
$$;

drop function public.console_ajouter_note(uuid, uuid, text, boolean);
create function public.console_ajouter_note(p_acteur uuid, p_boutique_id uuid, p_texte text, p_epinglee boolean default false, p_rappel date default null)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  perform private.console_exige_admin(p_acteur);
  if not exists (select 1 from plateforme.boutiques b where b.id = p_boutique_id) then
    raise exception 'Boutique introuvable' using errcode = 'no_data_found';
  end if;
  if length(btrim(coalesce(p_texte, ''))) = 0 then
    raise exception 'Une note vide ne se garde pas' using errcode = 'check_violation', hint = 'texte';
  end if;
  if p_rappel is not null and p_rappel > (now() at time zone 'Africa/Tunis')::date + 366 then
    raise exception 'Un rappel se pose dans l''année' using errcode = 'check_violation', hint = 'rappel';
  end if;
  insert into plateforme.notes_boutique (boutique_id, auteur, texte, epinglee, rappel)
  values (p_boutique_id, p_acteur, btrim(p_texte), coalesce(p_epinglee, false), p_rappel)
  returning id into v_id;
  perform private.console_trace(p_acteur, p_boutique_id, 'note.ajouter', v_id::text, null,
    case when p_rappel is null then null else jsonb_build_object('rappel', p_rappel) end);
  return v_id;
end;
$$;
revoke execute on function public.console_ajouter_note(uuid, uuid, text, boolean, date) from public, anon, authenticated;
grant  execute on function public.console_ajouter_note(uuid, uuid, text, boolean, date) to service_role;

create or replace function public.console_changer_note(p_acteur uuid, p_note_id bigint, p_geste text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_role plateforme.role_administrateur;
  n      plateforme.notes_boutique;
begin
  v_role := private.console_exige_admin(p_acteur);
  select * into n from plateforme.notes_boutique x where x.id = p_note_id for update;
  if not found then
    raise exception 'Note introuvable' using errcode = 'no_data_found';
  end if;
  case p_geste
    when 'epingler' then update plateforme.notes_boutique set epinglee = true where id = p_note_id;
    when 'detacher' then update plateforme.notes_boutique set epinglee = false where id = p_note_id;
    when 'rappel_fait' then
      if n.rappel is null then
        raise exception 'Cette note n''a pas de rappel' using errcode = 'check_violation';
      end if;
      update plateforme.notes_boutique set rappel_fait_le = now() where id = p_note_id;
    when 'supprimer' then
      if n.auteur is distinct from p_acteur and v_role <> 'super_admin' then
        raise exception 'Seul son auteur, ou un super-administrateur, retire une note' using errcode = 'insufficient_privilege';
      end if;
      delete from plateforme.notes_boutique where id = p_note_id;
    else
      raise exception 'Geste inconnu « % »', p_geste using errcode = 'check_violation';
  end case;
  perform private.console_trace(p_acteur, n.boutique_id, 'note.' || p_geste, p_note_id::text, null, null);
end;
$$;

-- Les rappels du jour (et ceux en retard), toutes boutiques.
create function public.console_rappels(p_acteur uuid)
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
             'id', n.id, 'texte', n.texte, 'rappel', n.rappel,
             'boutique', jsonb_build_object('id', b.id, 'slug', b.slug, 'nom', b.nom),
             'auteur', (select u.email from auth.users u where u.id = n.auteur))
           order by n.rappel, n.id)
      from plateforme.notes_boutique n join plateforme.boutiques b on b.id = n.boutique_id
     where n.rappel is not null and n.rappel_fait_le is null
       and n.rappel <= (now() at time zone 'Africa/Tunis')::date), '[]'::jsonb);
end;
$$;
revoke execute on function public.console_rappels(uuid) from public, anon, authenticated;
grant  execute on function public.console_rappels(uuid) to service_role;


-- ---------------------------------------------------------------------
-- Le journal : une période, et l'export
-- ---------------------------------------------------------------------
drop function public.console_journal(uuid, uuid, text, integer, integer);
create function public.console_journal(p_acteur uuid, p_boutique_id uuid default null, p_genre text default null,
                                       p_limite integer default 50, p_decalage integer default 0,
                                       p_du date default null, p_au date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  -- 5 000 au plus : l'export ; l'écran en demande 50.
  v_limite   integer := least(greatest(coalesce(p_limite, 50), 1), 5000);
  v_decalage integer := greatest(coalesce(p_decalage, 0), 0);
  v_genre    text := nullif(btrim(coalesce(p_genre, '')), '');
  -- Les jours de Tunis.
  v_de       timestamptz := case when p_du is null then null else p_du::timestamp at time zone 'Africa/Tunis' end;
  v_a        timestamptz := case when p_au is null then null else (p_au + 1)::timestamp at time zone 'Africa/Tunis' end;
begin
  perform private.console_exige_admin(p_acteur);
  return jsonb_build_object(
    'total', (select count(*) from plateforme.journal_audit j
               where (p_boutique_id is null or j.boutique_id = p_boutique_id)
                 and (v_genre is null or split_part(j.action, '.', 1) = v_genre)
                 and (v_de is null or j.at >= v_de) and (v_a is null or j.at < v_a)),
    'lignes', coalesce((
      select jsonb_agg(x order by (x ->> 'id')::bigint desc) from (
        select jsonb_build_object(
                 'id', j.id, 'at', j.at, 'action', j.action, 'cible', j.cible, 'avant', j.avant, 'apres', j.apres,
                 'ip', host(j.ip),
                 'acteur', (select u.email from auth.users u where u.id = j.acteur),
                 'boutique', (select jsonb_build_object('slug', b.slug, 'nom', b.nom) from plateforme.boutiques b where b.id = j.boutique_id)) as x
          from plateforme.journal_audit j
         where (p_boutique_id is null or j.boutique_id = p_boutique_id)
           and (v_genre is null or split_part(j.action, '.', 1) = v_genre)
           and (v_de is null or j.at >= v_de) and (v_a is null or j.at < v_a)
         order by j.id desc
         limit v_limite offset v_decalage) t), '[]'::jsonb)
  );
end;
$$;
revoke execute on function public.console_journal(uuid, uuid, text, integer, integer, date, date) from public, anon, authenticated;
grant  execute on function public.console_journal(uuid, uuid, text, integer, integer, date, date) to service_role;


-- ---------------------------------------------------------------------
-- Un export se trace : qui a emporté le journal, ou les chiffres, et avec
-- quels filtres.
-- ---------------------------------------------------------------------
create function public.console_tracer_export(p_acteur uuid, p_quoi text, p_filtres jsonb default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.console_exige_admin(p_acteur);
  if p_quoi not in ('journal', 'tableau') then
    raise exception 'Export inconnu « % »', p_quoi using errcode = 'check_violation';
  end if;
  perform private.console_trace(p_acteur, null, 'export.' || p_quoi, null, null, nullif(coalesce(p_filtres, '{}'::jsonb), '{}'::jsonb));
end;
$$;
revoke execute on function public.console_tracer_export(uuid, text, jsonb) from public, anon, authenticated;
grant  execute on function public.console_tracer_export(uuid, text, jsonb) to service_role;
