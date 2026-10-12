-- =====================================================================
-- LES ERREURS DE L'APPLICATION — avant le lancement, ce qui casse doit
-- se voir sans qu'un client le signale : une page de la vitrine, du
-- backoffice ou de la console qui ne s'affiche pas, une route qui échoue.
--
-- Chaque erreur du serveur (instrumentation.ts → onRequestError) et chaque
-- page cassée au navigateur se note ici, REGROUPÉE : une même erreur au
-- même endroit (son empreinte) est une ligne, qui compte ses fois. Rien
-- de personnel n'est gardé : la surface, la boutique, la route et le
-- dernier chemin (sans sa requête), le message et le début de la pile —
-- jamais un en-tête, un corps de requête ni une adresse.
--
-- La console les lit (État technique → Erreurs de l'application, la fiche
-- de la boutique, « À surveiller ») et les marque réglées. Quand elles
-- s'enchaînent (dix en une heure pour une boutique), la surveillance
-- horaire ouvre un incident : l'alerte part comme pour une vitrine en panne.
-- =====================================================================

create table plateforme.erreurs (
  id            bigint generated always as identity primary key,
  empreinte     text not null,
  surface       text not null check (surface in ('vitrine', 'backoffice', 'console', 'serveur')),
  genre         text not null default 'serveur' check (genre in ('serveur', 'navigateur')),
  boutique_id   uuid references plateforme.boutiques (id) on delete cascade,
  route         text check (char_length(route) <= 200),
  chemin        text check (char_length(chemin) <= 300),
  message       text not null check (char_length(message) between 1 and 500),
  pile          text check (char_length(pile) <= 1500),
  digest        text check (char_length(digest) <= 64),
  nombre        integer not null default 1 check (nombre >= 1),
  -- Les fois de l'heure en cours (pour dire « en série »).
  heure         timestamptz not null default date_trunc('hour', now()),
  nombre_heure  integer not null default 1,
  premiere_le   timestamptz not null default now(),
  derniere_le   timestamptz not null default now(),
  reglee_le     timestamptz,
  reglee_par    uuid references auth.users (id) on delete set null
);
-- Une empreinte n'a qu'une ligne ouverte : réglée, elle peut revenir (nouvelle ligne).
create unique index erreurs_ouverte_idx on plateforme.erreurs (empreinte) where reglee_le is null;
create index erreurs_derniere_idx on plateforme.erreurs (derniere_le desc);
create index erreurs_boutique_idx on plateforme.erreurs (boutique_id, derniere_le desc);
alter table plateforme.erreurs enable row level security;
-- Aucune politique : seules les fonctions ci-dessous (clé de service) y touchent.

comment on table plateforme.erreurs is
  'Les erreurs de l''application (serveur, navigateur), regroupées par empreinte et par boutique ; lues et réglées dans la console.';


-- ---------------------------------------------------------------------
-- 1. Noter (le serveur, clé de service) : jamais d'exception pour l'appelant
-- ---------------------------------------------------------------------
create function public.erreurs_noter(
  p_surface text, p_genre text, p_slug text, p_hote text, p_route text, p_chemin text,
  p_message text, p_pile text, p_digest text
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_surface text := case when p_surface in ('vitrine', 'backoffice', 'console', 'serveur') then p_surface else 'serveur' end;
  v_genre text := case when p_genre = 'navigateur' then 'navigateur' else 'serveur' end;
  v_boutique uuid;
  v_message text := left(nullif(btrim(regexp_replace(coalesce(p_message, ''), '\s+', ' ', 'g')), ''), 500);
  v_route text := left(nullif(btrim(coalesce(p_route, '')), ''), 200);
  v_chemin text := left(nullif(split_part(split_part(btrim(coalesce(p_chemin, '')), '?', 1), '#', 1), ''), 300);
  v_empreinte text;
  v_id bigint;
begin
  if v_message is null then return null; end if;
  -- La boutique : par l'adresse réécrite (/_b/<boutique>/…, /gestion/<boutique>/…), sinon par l'hôte.
  if nullif(btrim(coalesce(p_slug, '')), '') is not null then
    select b.id into v_boutique from plateforme.boutiques b where b.slug = lower(split_part(btrim(p_slug), '~', 1));
  end if;
  if v_boutique is null and nullif(btrim(coalesce(p_hote, '')), '') is not null then
    select d.boutique_id into v_boutique from plateforme.domaines d where d.hote = lower(split_part(btrim(p_hote), ':', 1));
  end if;
  -- L'empreinte : la même erreur au même endroit, chiffres et identifiants mis à part.
  v_empreinte := md5(concat_ws('|', v_surface, v_genre, coalesce(v_boutique::text, '-'), coalesce(v_route, v_chemin, '-'),
    regexp_replace(regexp_replace(v_message, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', '<id>', 'gi'), '[0-9]+', '#', 'g')));

  update plateforme.erreurs e
     set nombre = least(e.nombre, 2000000000) + 1,
         nombre_heure = case when e.heure = date_trunc('hour', now()) then e.nombre_heure + 1 else 1 end,
         heure = date_trunc('hour', now()),
         derniere_le = now(),
         chemin = coalesce(v_chemin, e.chemin),
         digest = coalesce(left(nullif(btrim(coalesce(p_digest, '')), ''), 64), e.digest),
         pile = coalesce(e.pile, left(nullif(btrim(coalesce(p_pile, '')), ''), 1500))
   where e.empreinte = v_empreinte and e.reglee_le is null
  returning e.id into v_id;
  if v_id is not null then return v_id; end if;

  -- Une erreur nouvelle : cinq cents ouvertes au plus (une avalanche ne remplit pas la base).
  if (select count(*) from plateforme.erreurs e where e.reglee_le is null) >= 500 then return null; end if;
  insert into plateforme.erreurs (empreinte, surface, genre, boutique_id, route, chemin, message, pile, digest)
  values (v_empreinte, v_surface, v_genre, v_boutique, v_route, v_chemin, v_message,
          left(nullif(btrim(coalesce(p_pile, '')), ''), 1500), left(nullif(btrim(coalesce(p_digest, '')), ''), 64))
  on conflict (empreinte) where reglee_le is null do update set nombre = plateforme.erreurs.nombre + 1, derniere_le = now()
  returning id into v_id;
  -- Trente jours d'histoire.
  delete from plateforme.erreurs e where e.derniere_le < now() - interval '30 days';
  return v_id;
end;
$$;


-- ---------------------------------------------------------------------
-- 2. La console : lire, marquer réglée
-- ---------------------------------------------------------------------
create function private.erreur_json(e plateforme.erreurs)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', e.id, 'surface', e.surface, 'genre', e.genre, 'route', e.route, 'chemin', e.chemin,
    'message', e.message, 'pile', e.pile, 'digest', e.digest, 'nombre', e.nombre,
    'premiere_le', e.premiere_le, 'derniere_le', e.derniere_le, 'reglee_le', e.reglee_le,
    'reglee_par', (select u.email from auth.users u where u.id = e.reglee_par),
    'boutique', (select jsonb_build_object('id', b.id, 'nom', b.nom, 'slug', b.slug, 'demonstration', b.demonstration)
                   from plateforme.boutiques b where b.id = e.boutique_id))
$$;
revoke execute on function private.erreur_json(plateforme.erreurs) from public, anon, authenticated;

create function public.console_erreurs(p_acteur uuid, p_boutique_id uuid default null, p_reglees boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.console_exige_admin(p_acteur);
  return jsonb_build_object(
    -- Les ouvertes, la plus récente d'abord ; les réglées des sept derniers jours, à la demande.
    'erreurs', coalesce((select jsonb_agg(private.erreur_json(e) order by e.reglee_le is not null, e.derniere_le desc)
                           from (select x.* from plateforme.erreurs x
                                  where (p_boutique_id is null or x.boutique_id = p_boutique_id)
                                    and (x.reglee_le is null or (p_reglees and x.reglee_le > now() - interval '7 days'))
                                  order by x.reglee_le is not null, x.derniere_le desc limit 100) e), '[]'::jsonb),
    'ouvertes', (select count(*) from plateforme.erreurs e where e.reglee_le is null and (p_boutique_id is null or e.boutique_id = p_boutique_id)),
    'reglees_7j', (select count(*) from plateforme.erreurs e where e.reglee_le > now() - interval '7 days' and (p_boutique_id is null or e.boutique_id = p_boutique_id)),
    'fois_24h', coalesce((select sum(e.nombre) from plateforme.erreurs e
                           where e.reglee_le is null and e.derniere_le > now() - interval '24 hours'
                             and (p_boutique_id is null or e.boutique_id = p_boutique_id)), 0));
end;
$$;

-- Pour « À surveiller » : par boutique (et la plateforme), les erreurs ouvertes vues ces 24 heures.
create function public.console_erreurs_etat(p_acteur uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.console_exige_admin(p_acteur);
  return coalesce((select jsonb_agg(jsonb_build_object('boutique_id', g.boutique_id, 'erreurs', g.n, 'fois', g.fois, 'derniere_le', g.derniere,
                                                       'surface', g.surface))
                     from (select e.boutique_id, count(*) as n, sum(e.nombre) as fois, max(e.derniere_le) as derniere,
                                  case when count(distinct e.surface) = 1 then min(e.surface) else 'application' end as surface
                             from plateforme.erreurs e
                            where e.reglee_le is null and e.derniere_le > now() - interval '24 hours'
                            group by e.boutique_id) g), '[]'::jsonb);
end;
$$;

-- Marquer réglées (une, ou toutes celles d'une boutique, ou toutes) : le support le peut aussi.
create function public.console_regler_erreurs(p_acteur uuid, p_ids bigint[] default null, p_boutique_id uuid default null)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  perform private.console_exige_admin(p_acteur);
  update plateforme.erreurs e
     set reglee_le = now(), reglee_par = p_acteur
   where e.reglee_le is null
     and (p_ids is null or e.id = any (p_ids))
     and (p_boutique_id is null or e.boutique_id = p_boutique_id);
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'Rien à marquer : elles sont déjà réglées' using errcode = 'check_violation', hint = 'etat';
  end if;
  perform private.console_trace(p_acteur, p_boutique_id, 'plateforme.erreurs_reglees', null, null,
    jsonb_build_object('erreurs', v_n, 'ids', case when p_ids is null then null else to_jsonb(p_ids) end));
  return v_n;
end;
$$;


-- ---------------------------------------------------------------------
-- 3. La surveillance horaire : des erreurs en série ouvrent un incident
-- ---------------------------------------------------------------------
alter table plateforme.surveillance_releves drop constraint surveillance_releves_genre_check;
alter table plateforme.surveillance_releves add constraint surveillance_releves_genre_check
  check (genre in ('page', 'courriels', 'skanfact', 'domaine_envoi', 'erreurs'));
alter table plateforme.incidents drop constraint incidents_genre_check;
alter table plateforme.incidents add constraint incidents_genre_check
  check (genre in ('page', 'courriels', 'skanfact', 'domaine_envoi', 'erreurs'));

-- Dix fois ou plus en une heure (cette heure et la précédente) pour une
-- boutique (ou la plateforme) : un relevé en défaut du passage. Le passage
-- suivant, retombées sous le seuil ou réglées, l'incident se clôt seul.
create function private.surveillance_erreurs(p_passage bigint)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into plateforme.surveillance_releves (passage_id, boutique_id, genre, cible, ok, detail)
  select p_passage, g.boutique_id, 'erreurs', 'erreurs de l''application', false,
         format('%s erreur%s en une heure — la plus fréquente : « %s »', g.fois, case when g.fois > 1 then 's' else '' end, left(g.message, 120))
    from (select e.boutique_id, sum(e.nombre_heure) as fois,
                 (array_agg(e.message order by e.nombre_heure desc))[1] as message
            from plateforme.erreurs e
           where e.reglee_le is null and e.heure >= date_trunc('hour', now()) - interval '1 hour'
           group by e.boutique_id) g
   where g.fois >= 10
$$;
revoke execute on function private.surveillance_erreurs(bigint) from public, anon, authenticated;

-- surveillance_incidents relève d'abord les erreurs en série du passage (le reste à l'identique).
create or replace function public.surveillance_incidents(p_passage bigint)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r record;
  v_cle text;
  v_reglage jsonb := private.alertes_reglage();
begin
  if not exists (select 1 from plateforme.surveillance_passages p where p.id = p_passage) then
    raise exception 'Passage inconnu' using errcode = 'no_data_found';
  end if;

  -- Les erreurs de l'application en série, une fois par passage.
  if not exists (select 1 from plateforme.surveillance_releves x where x.passage_id = p_passage and x.genre = 'erreurs') then
    perform private.surveillance_erreurs(p_passage);
  end if;

  -- Ce qui casse à ce passage : ouvrir, ou prolonger.
  for r in
    select distinct on (private.incident_cle(x.genre, x.boutique_id, x.cible)) x.genre, x.boutique_id, x.cible, x.detail
      from plateforme.surveillance_releves x
     where x.passage_id = p_passage and not x.ok
     order by private.incident_cle(x.genre, x.boutique_id, x.cible), x.id
  loop
    v_cle := private.incident_cle(r.genre, r.boutique_id, r.cible);
    update plateforme.incidents i
       set echecs = i.echecs + 1, dernier_le = now(), detail = coalesce(r.detail, i.detail)
     where i.cle = v_cle and i.clos_le is null;
    if not found then
      insert into plateforme.incidents (cle, genre, boutique_id, cible, detail)
      values (v_cle, r.genre, r.boutique_id, lower(r.cible), r.detail);
    end if;
  end loop;

  -- Ce qui ne casse plus : clore. Une vitrine, quand elle a répondu à ce
  -- passage (ou n'est plus surveillée : boutique fermée, domaine retiré) ;
  -- un domaine d'envoi, quand il est de nouveau vérifié (ou retiré) — il ne
  -- se vérifie qu'une fois par jour ; une file, ou des erreurs en série,
  -- dès qu'elles ne sont plus relevées.
  update plateforme.incidents i
     set clos_le = now()
   where i.clos_le is null
     and not exists (select 1 from plateforme.surveillance_releves x
                      where x.passage_id = p_passage and not x.ok
                        and private.incident_cle(x.genre, x.boutique_id, x.cible) = i.cle)
     and case i.genre
           when 'page' then
             exists (select 1 from plateforme.surveillance_releves x
                      where x.passage_id = p_passage and x.ok and x.genre = 'page' and lower(x.cible) = i.cible)
             or not exists (select 1 from plateforme.domaines d join plateforme.boutiques b on b.id = d.boutique_id
                             where d.hote = i.cible and b.statut = 'active')
           when 'domaine_envoi' then
             not exists (select 1 from plateforme.courriels_boutique c
                          where c.boutique_id = i.boutique_id and c.domaine = i.cible and c.statut is distinct from 'verifie')
           else true
         end;

  -- Quatre-vingt-dix jours d'histoire.
  delete from plateforme.incidents i where i.clos_le < now() - interval '90 days';

  return jsonb_build_object(
    'actives', v_reglage -> 'actives',
    'destinataires', v_reglage -> 'destinataires',
    -- À annoncer : ouvert, au seuil, pas encore annoncé (un jour d'essais au plus).
    'ouverts', coalesce((select jsonb_agg(private.incident_json(i) order by i.genre <> 'page', i.ouvert_le)
                           from plateforme.incidents i
                          where i.clos_le is null and i.alerte_ouverture_le is null
                            and i.echecs >= private.incident_seuil(i.genre) and i.alerte_essais < 24), '[]'::jsonb),
    -- Rétabli, après avoir été annoncé.
    'retablis', coalesce((select jsonb_agg(private.incident_json(i) order by i.clos_le)
                            from plateforme.incidents i
                           where i.clos_le is not null and i.alerte_ouverture_le is not null
                             and i.alerte_cloture_le is null and i.alerte_essais < 24), '[]'::jsonb));
end;
$$;

revoke execute on function public.erreurs_noter(text, text, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.console_erreurs(uuid, uuid, boolean) from public, anon, authenticated;
revoke execute on function public.console_erreurs_etat(uuid) from public, anon, authenticated;
revoke execute on function public.console_regler_erreurs(uuid, bigint[], uuid) from public, anon, authenticated;
grant  execute on function public.erreurs_noter(text, text, text, text, text, text, text, text, text) to service_role;
grant  execute on function public.console_erreurs(uuid, uuid, boolean) to service_role;
grant  execute on function public.console_erreurs_etat(uuid) to service_role;
grant  execute on function public.console_regler_erreurs(uuid, bigint[], uuid) to service_role;
