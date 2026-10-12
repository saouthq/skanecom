-- =====================================================================
-- LA CHRONOLOGIE — « qu'est-ce qui a changé juste avant que ça casse ? »
--
-- 1. LES MISES EN LIGNE : chaque version de l'application (son commit, son
--    titre, quand elle a été construite, la dernière migration qu'elle
--    attend) se note elle-même — à chaque passage de la surveillance et à
--    chaque ouverture de l'État technique. Une ligne par mise en ligne ; un
--    retour à une version déjà vue (retour arrière) fait une ligne aussi.
--    Pendant un déploiement, l'ancienne et la nouvelle version répondent un
--    instant ensemble : une version plus ancienne que la dernière vue, revue
--    dans le quart d'heure, n'est pas un retour arrière.
-- 2. LA CHRONOLOGIE : sur une période, d'un seul fil — les mises en ligne,
--    les changements de configuration (le journal, sans les notes, les
--    exports, les prospects ni la vie courante des commandes), les pannes
--    ouvertes et rétablies, les erreurs apparues. Pour une boutique : les
--    siens, et ce qui touche toute la plateforme.
-- =====================================================================

create table plateforme.mises_en_ligne (
  id            bigint generated always as identity primary key,
  version       text not null check (char_length(version) between 1 and 64),
  titre         text check (char_length(titre) <= 300),
  construite_le timestamptz,
  migration     text check (char_length(migration) <= 64),
  vue_le        timestamptz not null default now(),
  derniere_vue  timestamptz not null default now()
);
create index mises_en_ligne_vue_idx on plateforme.mises_en_ligne (vue_le desc);
alter table plateforme.mises_en_ligne enable row level security;
-- Aucune politique : seules les fonctions ci-dessous y touchent.

comment on table plateforme.mises_en_ligne is
  'Les versions de l''application vues en ligne, une ligne par mise en ligne (ou retour arrière) : la chronologie de l''État technique.';


-- ---------------------------------------------------------------------
-- 1. La version en ligne se note (l'application, clé service_role)
-- ---------------------------------------------------------------------
create function public.versions_noter(p_version text, p_titre text, p_construite_le timestamptz, p_migration text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_der plateforme.mises_en_ligne;
  v_version text := left(nullif(btrim(coalesce(p_version, '')), ''), 64);
begin
  if v_version is null then
    return false;
  end if;
  select * into v_der from plateforme.mises_en_ligne order by id desc limit 1;
  if v_der.id is not null and v_der.version = v_version then
    update plateforme.mises_en_ligne set derniere_vue = now() where id = v_der.id;
    return false;
  end if;
  -- L'ancienne version qui répond encore pendant le déploiement : pas un retour arrière.
  if v_der.id is not null and p_construite_le is not null and v_der.construite_le is not null
     and p_construite_le < v_der.construite_le and v_der.vue_le > now() - interval '15 minutes' then
    return false;
  end if;
  insert into plateforme.mises_en_ligne (version, titre, construite_le, migration)
  values (v_version, left(nullif(btrim(coalesce(p_titre, '')), ''), 300), p_construite_le, left(nullif(btrim(coalesce(p_migration, '')), ''), 64));
  -- Les 200 dernières suffisent.
  delete from plateforme.mises_en_ligne m
   where m.id < (select x.id from plateforme.mises_en_ligne x order by x.id desc offset 199 limit 1);
  return true;
end;
$$;
revoke execute on function public.versions_noter(text, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.versions_noter(text, text, timestamptz, text) to service_role;


-- ---------------------------------------------------------------------
-- 2. Ce que la chronologie retient du journal : ce qui change la
--    configuration (et peut casser), pas la vie courante.
-- ---------------------------------------------------------------------
create function private.chronologie_retient(p_action text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_action ~ '^(plateforme|module|domaine|theme|apparence|accueil|page|reglages|konnect|rayon|formule|administrateur)\.'
      or p_action in ('boutique.creer', 'boutique.statut', 'boutique.metier', 'boutique.formule', 'boutique.droits',
                      'boutique.renommer', 'boutique.cloner', 'boutique.maintenance', 'boutique.cache_vide',
                      'boutique.file_relancee', 'boutique.quotas', 'boutique.courriels', 'boutique.domaine_envoi',
                      'boutique.domaine_branche', 'boutique.domaine_achete', 'boutique.double_auth_exigee',
                      'catalogue.importer', 'support.ouvert', 'support.ferme')
$$;
revoke execute on function private.chronologie_retient(text) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 3. La console : les mises en ligne, et le fil d'une période
-- ---------------------------------------------------------------------
create function public.console_chronologie(p_acteur uuid, p_jours integer, p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_jours integer := greatest(1, least(coalesce(p_jours, 7), 30));
  v_depuis timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_jours, 7), 30)));
  v_migration text;
  v_fil jsonb;
  v_total integer;
begin
  perform private.console_exige_admin(p_acteur);
  -- La dernière migration jouée sur cette base (Supabase la note ; la base locale aussi, outils/base-locale.sh).
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    execute 'select max(version) from supabase_migrations.schema_migrations' into v_migration;
  end if;

  with fil as (
    -- Les mises en ligne (elles touchent toutes les boutiques).
    select m.vue_le as quand, jsonb_build_object(
             'genre', 'version', 'quand', m.vue_le, 'version', m.version, 'titre', m.titre,
             'construite_le', m.construite_le, 'migration', m.migration,
             'retour', exists (select 1 from plateforme.mises_en_ligne p where p.version = m.version and p.id < m.id)) as e
      from plateforme.mises_en_ligne m
     where m.vue_le >= v_depuis
    union all
    -- Les changements de configuration (le journal) : de la boutique, et ceux de toute la plateforme.
    select j.at, jsonb_build_object(
             'genre', 'changement', 'quand', j.at, 'action', j.action, 'cible', j.cible,
             'qui', (select u.email from auth.users u where u.id = j.acteur),
             'boutique', case when b.id is null then null else jsonb_build_object('slug', b.slug, 'nom', b.nom, 'demonstration', b.demonstration) end)
      from plateforme.journal_audit j
      left join plateforme.boutiques b on b.id = j.boutique_id
     where j.at >= v_depuis and private.chronologie_retient(j.action)
       and (p_boutique_id is null or j.boutique_id = p_boutique_id or j.boutique_id is null)
    union all
    -- Les pannes, à leur ouverture…
    select i.ouvert_le, jsonb_build_object(
             'genre', 'panne', 'quand', i.ouvert_le, 'type', i.genre, 'cible', i.cible, 'detail', i.detail,
             'clos_le', i.clos_le,
             'boutique', case when b.id is null then null else jsonb_build_object('slug', b.slug, 'nom', b.nom, 'demonstration', b.demonstration) end)
      from plateforme.incidents i
      left join plateforme.boutiques b on b.id = i.boutique_id
     where i.ouvert_le >= v_depuis and (p_boutique_id is null or i.boutique_id = p_boutique_id or i.boutique_id is null)
    union all
    -- … et à leur retour.
    select i.clos_le, jsonb_build_object(
             'genre', 'retabli', 'quand', i.clos_le, 'type', i.genre, 'cible', i.cible, 'ouvert_le', i.ouvert_le,
             'boutique', case when b.id is null then null else jsonb_build_object('slug', b.slug, 'nom', b.nom, 'demonstration', b.demonstration) end)
      from plateforme.incidents i
      left join plateforme.boutiques b on b.id = i.boutique_id
     where i.clos_le >= v_depuis and (p_boutique_id is null or i.boutique_id = p_boutique_id or i.boutique_id is null)
    union all
    -- Les erreurs de l'application, quand elles apparaissent.
    select x.premiere_le, jsonb_build_object(
             'genre', 'erreur', 'quand', x.premiere_le, 'id', x.id, 'surface', x.surface, 'type', x.genre,
             'message', x.message, 'route', coalesce(x.route, x.chemin), 'nombre', x.nombre, 'reglee', x.reglee_le is not null,
             'boutique', case when b.id is null then null else jsonb_build_object('slug', b.slug, 'nom', b.nom, 'demonstration', b.demonstration) end)
      from plateforme.erreurs x
      left join plateforme.boutiques b on b.id = x.boutique_id
     where x.premiere_le >= v_depuis and (p_boutique_id is null or x.boutique_id = p_boutique_id or x.boutique_id is null)
  )
  select (select count(*) from fil),
         coalesce((select jsonb_agg(f.e order by f.quand desc) from (select * from fil order by quand desc limit 300) f), '[]'::jsonb)
    into v_total, v_fil;

  return jsonb_build_object(
    'jours', v_jours,
    'fil', v_fil,
    'total', v_total,
    'migration_base', v_migration,
    -- Les dernières mises en ligne, quelle que soit la période.
    'versions', coalesce((
      select jsonb_agg(jsonb_build_object('version', m.version, 'titre', m.titre, 'construite_le', m.construite_le,
                                          'migration', m.migration, 'vue_le', m.vue_le, 'derniere_vue', m.derniere_vue) order by m.id desc)
        from (select * from plateforme.mises_en_ligne order by id desc limit 8) m), '[]'::jsonb));
end;
$$;
revoke execute on function public.console_chronologie(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.console_chronologie(uuid, integer, uuid) to service_role;
