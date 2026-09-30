-- =====================================================================
-- SkanEcom — 44 · CONSOLE : LE POSTE DE PILOTAGE
-- =====================================================================
-- L'accueil de la console répond, pour chaque boutique, à ce que Skander
-- se demande en l'ouvrant :
--   · à quoi elle ressemble — sa marque : gabarit, couleurs, logo, image
--     d'ouverture ;
--   · où en est sa mise en place — étapes faites, et la prochaine ;
--   · ce qu'elle vend — les commandes des sept derniers jours, jour par
--     jour (heure de Tunis), et ce qui a été encaissé ;
--   · ce qui attend — les commandes à confirmer, et depuis quand ;
--   · si le support y est entré — un accès ouvert, jusqu'à quand.
-- En un appel, pour toutes les boutiques. Lu avec la clé service_role,
-- après exigeAdmin(), comme le reste de la console.
-- =====================================================================

create function public.console_pilotage()
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

comment on function public.console_pilotage() is
  'Le poste de pilotage de la console : pour chaque boutique, sa marque, sa mise en place (et la prochaine étape), ses commandes à confirmer, ses sept derniers jours, l''accès support ouvert. Clé service_role seulement.';

revoke execute on function public.console_pilotage() from public, anon, authenticated;
grant  execute on function public.console_pilotage() to service_role;
