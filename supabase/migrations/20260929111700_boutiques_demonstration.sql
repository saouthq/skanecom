-- =====================================================================
-- SkanEcom — 78 · LES BOUTIQUES DE DÉMONSTRATION
-- =====================================================================
--
-- Maison Selma, Dar Alia, Yasmine Beauté, la Quincaillerie du Sud : des
-- boutiques montrées aux prospects, pas des clients. La console les mêlait
-- aux clients — leurs commandes de démonstration comptaient dans la
-- synthèse de la plateforme, leurs commandes « à confirmer » remplissaient
-- « À surveiller ». Une boutique se marque maintenant « de démonstration »
-- (depuis sa page, dans la console ; coupé par défaut, tracé au journal) :
-- la console la met à part, et elle n'aura pas de client à facturer
-- (cadrage/06-facturation-skanfact.md). Rien ne change pour sa vitrine.
-- =====================================================================

alter table plateforme.boutiques add column demonstration boolean not null default false;

comment on column plateforme.boutiques.demonstration is
  'Une boutique montrée aux prospects, pas un client : la console la met à part (synthèse, « À surveiller », facturation). La vitrine n''en sait rien.';

create function public.console_marquer_demonstration(p_acteur uuid, p_boutique_id uuid, p_demonstration boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_avant boolean;
begin
  perform private.console_exige_admin(p_acteur);
  if p_demonstration is null then
    raise exception 'Démonstration ou cliente ?' using errcode = 'check_violation';
  end if;
  select b.demonstration into v_avant from plateforme.boutiques b where b.id = p_boutique_id for update;
  if not found then
    raise exception 'Boutique introuvable' using errcode = 'no_data_found';
  end if;
  if v_avant = p_demonstration then
    return;
  end if;
  update plateforme.boutiques set demonstration = p_demonstration where id = p_boutique_id;
  perform private.console_trace(p_acteur, p_boutique_id, 'boutique.demonstration',
    case when p_demonstration then 'démonstration' else 'cliente' end,
    jsonb_build_object('demonstration', v_avant), jsonb_build_object('demonstration', p_demonstration));
end;
$$;

revoke execute on function public.console_marquer_demonstration(uuid, uuid, boolean) from public, anon, authenticated;
grant  execute on function public.console_marquer_demonstration(uuid, uuid, boolean) to service_role;

-- La fiche d'une boutique et le poste de pilotage disent si elle est de démonstration.
create or replace function public.console_boutique(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'boutique', jsonb_build_object(
      'id', b.id, 'slug', b.slug, 'nom', b.nom, 'statut', b.statut,
      'langue_defaut', b.langue_defaut, 'langues_actives', b.langues_actives, 'created_at', b.created_at,
      'demonstration', b.demonstration),
    'domaines', coalesce((select jsonb_agg(jsonb_build_object('hote', d.hote, 'type', d.type, 'principal', d.principal,
                                                              'statut_certificat', d.statut_certificat)
                                           order by d.principal desc, d.hote)
                            from plateforme.domaines d where d.boutique_id = b.id), '[]'::jsonb),
    'theme', (select to_jsonb(t) - 'boutique_id' from public.themes t where t.boutique_id = b.id),
    'compteurs', jsonb_build_object(
      'produits',   (select count(*) from public.produits p where p.boutique_id = b.id),
      'publies',    (select count(*) from public.produits p where p.boutique_id = b.id and p.publie),
      'variantes',  (select count(*) from public.variantes v where v.boutique_id = b.id),
      'categories', (select count(*) from public.categories c where c.boutique_id = b.id)),
    'journal', coalesce((select jsonb_agg(j order by j.at desc)
                           from (select ja.at, ja.action, ja.cible, u.email as acteur
                                   from plateforme.journal_audit ja
                                   left join auth.users u on u.id = ja.acteur
                                  where ja.boutique_id = b.id
                                  order by ja.at desc
                                  limit 20) j), '[]'::jsonb)
  )
  from plateforme.boutiques b
  where b.slug = p_slug;
$$;

create or replace function public.console_pilotage()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with bornes as (
    select (now() at time zone 'Africa/Tunis')::date as aujourdhui,
           (((now() at time zone 'Africa/Tunis')::date - 6)::timestamp at time zone 'Africa/Tunis') as debut
  ),
  jours as (
    select (b.aujourdhui - k) as jour from bornes b, generate_series(6, 0, -1) k
  )
  select coalesce(jsonb_agg(ligne order by cree_le, nom), '[]'::jsonb)
  from (
    select b.created_at as cree_le, b.nom,
      jsonb_build_object(
        'id', b.id, 'slug', b.slug, 'nom', b.nom, 'statut', b.statut, 'creee_le', b.created_at,
        'demonstration', b.demonstration,
        'hote', (select d.hote from plateforme.domaines d where d.boutique_id = b.id and d.principal),

        -- La marque, telle que la vitrine la pose (les couleurs absentes
        -- sont celles du gabarit : l'application les complète).
        'marque', jsonb_build_object(
          'code', t.code,
          'couleurs', coalesce(t.couleurs, '{}'::jsonb),
          'logo_chemin', t.logo_chemin,
          'logo_mode', t.logo_mode,
          'logo_ratio', t.logo_ratio,
          'monogramme_chemin', t.monogramme_chemin,
          'image', (select s -> 'image' ->> 'chemin'
                      from jsonb_array_elements(coalesce(t.sections, '[]'::jsonb)) s
                     where s ->> 'type' = 'hero' and s -> 'image' ->> 'chemin' is not null
                     limit 1)),

        -- La mise en place (C6) : ce qui est fait, et la première étape qui
        -- ne l'est pas, dans l'ordre de la liste.
        'mise_en_place', (
          select jsonb_build_object(
            'faites', count(*) filter (where (e ->> 'fait')::boolean),
            'total', count(*),
            'prochaine', (array_agg(e ->> 'cle' order by n) filter (where not (e ->> 'fait')::boolean))[1])
            from jsonb_array_elements(public.console_mise_en_place(b.id) -> 'etapes') with ordinality as x(e, n)),

        -- Ce qui attend, et la semaine.
        'commandes', (
          select jsonb_build_object(
            'a_confirmer', count(*) filter (where c.statut in ('a_arbitrer', 'recue')),
            'attente_depuis', min(c.created_at) filter (where c.statut in ('a_arbitrer', 'recue')),
            'semaine', count(*) filter (where c.created_at >= bo.debut and c.statut not in ('a_arbitrer', 'annulee')),
            'encaisse_semaine', coalesce(sum(c.total_millimes) filter (where c.statut = 'livree' and c.livree_at >= bo.debut), 0))
            from public.commandes c, bornes bo
           where c.boutique_id = b.id),

        -- Les commandes reçues chaque jour, du plus ancien à aujourd'hui.
        'jours', (
          select jsonb_agg(coalesce(k.n, 0) order by j.jour)
            from jours j
            left join (
              select (c.created_at at time zone 'Africa/Tunis')::date as jour, count(*) as n
                from public.commandes c, bornes bo
               where c.boutique_id = b.id and c.created_at >= bo.debut and c.statut not in ('a_arbitrer', 'annulee')
               group by 1) k on k.jour = j.jour),

        'produits', (select count(*) from public.produits p where p.boutique_id = b.id),
        'publies', (select count(*) from public.produits p where p.boutique_id = b.id and p.publie),
        'equipe', (select count(*) from plateforme.membres m where m.boutique_id = b.id and m.actif),

        -- Un accès support ouvert (C7), le plus lointain s'il y en a deux.
        'support', (
          select jsonb_build_object('jusqua', a.expire_le, 'role', a.role)
            from plateforme.acces_support a
           where a.boutique_id = b.id and a.ferme_le is null and a.expire_le > now()
           order by a.expire_le desc
           limit 1)
      ) as ligne
    from plateforme.boutiques b
    left join public.themes t on t.boutique_id = b.id
  ) x;
$$;
