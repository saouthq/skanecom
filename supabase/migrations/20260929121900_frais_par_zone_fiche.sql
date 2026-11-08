-- =====================================================================
-- Les frais de livraison par zone, annoncés sur la fiche produit
-- =====================================================================
-- Joué au téléphone (08/11) : Maison Selma passe au tarif par zone (Grand
-- Tunis 7 TND, le reste du pays 9 TND). La fiche produit ne disait que
-- « Les frais dépendent de votre région, calculés au moment de la
-- commande » — des frais cachés, alors que la boutique les connaît.
--
-- Le cadre de la boutique dit désormais si un gouvernorat n'est dans
-- aucune zone active (il paie alors le tarif fixe) : la fiche annonce la
-- fourchette exacte, « de 7,000 à 9,000 TND selon votre région ».
-- =====================================================================

CREATE OR REPLACE FUNCTION private.cadre_boutique(p_boutique_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'boutique', jsonb_build_object(
      'id', b.id, 'slug', b.slug, 'nom', b.nom,
      'langue_defaut', b.langue_defaut, 'langues_actives', b.langues_actives, 'devise', b.devise,
      'hote_principal', (select d.hote from plateforme.domaines d where d.boutique_id = b.id and d.principal),
      'nb_produits', (select count(*) from public.produits p where p.boutique_id = b.id and p.publie)),
    'configuration', public.configuration_publique(b.id),
    'theme', (select to_jsonb(t) - 'boutique_id' - 'updated_by' from public.themes t where t.boutique_id = b.id),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'parent_id', c.parent_id, 'slug', c.slug,
               'nom_fr', c.nom_fr, 'nom_ar', c.nom_ar,
               'description_fr', c.description_fr, 'description_ar', c.description_ar,
               'image_chemin', c.image_chemin, 'position', c.position,
               'nb_produits', (select count(*) from public.produits p
                                where p.boutique_id = b.id and p.categorie_id = c.id and p.publie))
             order by c.position, c.slug)
      from public.categories c where c.boutique_id = b.id and c.actif), '[]'::jsonb),
    'zones', coalesce((
      select jsonb_agg(jsonb_build_object(
               'nom_fr', z.nom_fr, 'nom_ar', z.nom_ar, 'frais_millimes', z.frais_millimes,
               'delai_jours_min', z.delai_jours_min, 'delai_jours_max', z.delai_jours_max)
             order by z.position)
      from public.zones_livraison z where z.boutique_id = b.id and z.actif), '[]'::jsonb),
    -- Un gouvernorat hors de toute zone active paie le tarif fixe : la fiche
    -- produit compte ce tarif dans la fourchette qu'elle annonce.
    'hors_zone', exists (
      select 1 from public.gouvernorats g
       where not exists (select 1 from public.zones_gouvernorats zg
                           join public.zones_livraison z on z.boutique_id = zg.boutique_id and z.id = zg.zone_id and z.actif
                          where zg.boutique_id = b.id and zg.gouvernorat_code = g.code)),
    -- Le supplément au poids, s'il est en vigueur (conditions de vente, tunnel).
    'tranches_poids', case when coalesce((private.reglage(b.id, 'livraison.supplement_poids') #>> '{}')::boolean, false) then
      coalesce((select jsonb_agg(jsonb_build_object('jusqu_a_grammes', t.jusqu_a_grammes, 'supplement_millimes', t.supplement_millimes)
                                 order by t.jusqu_a_grammes nulls last)
                  from public.tranches_poids t where t.boutique_id = b.id), '[]'::jsonb) end,
    -- Les pages publiées, dans l'ordre de la boutique.
    'pages', coalesce((
      select jsonb_agg(jsonb_build_object('slug', p.slug, 'titre_fr', p.titre_fr, 'titre_ar', p.titre_ar,
                                          'genre', p.genre, 'dans_pied', p.dans_pied)
             order by p.position, p.titre_fr)
      from public.pages_boutique p where p.boutique_id = b.id and p.publie), '[]'::jsonb)
  )
  from plateforme.boutiques b
  where b.id = p_boutique_id;
$function$;
