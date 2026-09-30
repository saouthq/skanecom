-- =====================================================================
-- SkanEcom — 41 · BACKOFFICE : « AUJOURD'HUI »
-- =====================================================================
-- Le matin, la première question n'est pas « combien ce mois-ci ? » (le
-- tableau de bord y répond) mais « qu'est-ce qui m'attend ? » : les
-- commandes à appeler (et celles à rappeler), à préparer, en route depuis
-- trop longtemps, les retraits prêts au comptoir ; ce que les modules
-- demandent (SAV, devis, avis, comptes pro) ; les pièces épuisées ou
-- presque. En un appel, pour toute l'équipe ; les montants de la journée,
-- pour la direction seulement (propriétaire, administrateur, lecture —
-- comme le tableau de bord).
-- =====================================================================

create function public.gestion_aujourdhui(p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_jour      date := (now() at time zone 'Africa/Tunis')::date;
  v_debut     timestamptz := (v_jour::timestamp) at time zone 'Africa/Tunis';
  v_direction boolean;
begin
  perform private.catalogue_exige(p_boutique_id);
  v_direction := private.est_membre(p_boutique_id, '{proprietaire,admin,lecture}');

  return jsonb_build_object(
    'jour', v_jour,
    'direction', v_direction,

    -- Ce qui attend un geste : le compte, et depuis quand.
    'commandes', (
      select jsonb_build_object(
        'a_confirmer',  count(*) filter (where c.statut in ('a_arbitrer', 'recue')),
        -- Le dernier appel n'a pas abouti : injoignable, ou « rappeler ».
        'a_rappeler',   count(*) filter (where c.statut = 'recue' and (
                          select k.resultat from public.confirmations k
                           where k.boutique_id = c.boutique_id and k.commande_id = c.id
                           order by k.created_at desc limit 1) in ('injoignable', 'rappeler')),
        'attente_depuis', min(c.created_at) filter (where c.statut in ('a_arbitrer', 'recue')),
        'a_preparer',   count(*) filter (where c.statut = 'confirmee'),
        'en_livraison', count(*) filter (where c.statut = 'expediee' and c.mode_livraison = 'domicile'),
        -- En route depuis plus de cinq jours : à suivre avec le transporteur.
        'en_retard',    count(*) filter (where c.statut = 'expediee' and c.mode_livraison = 'domicile'
                                           and c.expediee_at < now() - interval '5 days'),
        'retraits_prets', count(*) filter (where c.statut = 'expediee' and c.mode_livraison = 'retrait'))
        from public.commandes c
       where c.boutique_id = p_boutique_id and c.statut in ('a_arbitrer', 'recue', 'confirmee', 'expediee')),

    -- La journée (depuis minuit, heure de Tunis).
    'journee', (
      select jsonb_build_object(
        'recues',   count(*) filter (where c.created_at >= v_debut and c.statut <> 'a_arbitrer'),
        'livrees',  count(*) filter (where c.statut = 'livree' and c.livree_at >= v_debut),
        'refusees', count(*) filter (where c.statut = 'refusee' and c.cloturee_at >= v_debut),
        'recues_millimes',  case when v_direction then coalesce(sum(c.total_millimes)
                              filter (where c.created_at >= v_debut and c.statut not in ('a_arbitrer', 'annulee')), 0) end,
        'livrees_millimes', case when v_direction then coalesce(sum(c.total_millimes)
                              filter (where c.statut = 'livree' and c.livree_at >= v_debut), 0) end)
        from public.commandes c
       where c.boutique_id = p_boutique_id
         and (c.created_at >= v_debut or c.livree_at >= v_debut or c.cloturee_at >= v_debut)),

    -- Ce que les modules actifs demandent (null : module absent).
    'modules', jsonb_build_object(
      'sav',         case when private.sav_actif(p_boutique_id) then
                       (select count(*) from public.sav_demandes s where s.boutique_id = p_boutique_id and s.statut = 'nouvelle') end,
      'devis',       case when private.devis_actif(p_boutique_id) then
                       (select count(*) from public.devis d where d.boutique_id = p_boutique_id and d.statut = 'demande') end,
      'avis',        case when private.avis_actif(p_boutique_id) then
                       (select count(*) from public.avis a where a.boutique_id = p_boutique_id and a.statut = 'en_attente') end,
      'comptes_pro', case when private.comptes_pro_actif(p_boutique_id) then
                       (select count(*) from public.comptes_pro cp where cp.boutique_id = p_boutique_id and cp.statut = 'demande') end),

    -- Les pièces en vente épuisées ou sous leur seuil d'alerte ; les six
    -- plus urgentes (épuisées d'abord, puis le moins de stock).
    'stock', (
      with pieces as (
        select v.id, v.sku, v.stock, v.seuil_alerte_stock, p.id as produit_id, coalesce(p.nom_fr, p.nom_ar) as produit,
               private.libelle_variante(p_boutique_id, p.id, v.options) as declinaison
          from public.variantes v
          join public.produits p on p.boutique_id = v.boutique_id and p.id = v.produit_id and p.publie
         where v.boutique_id = p_boutique_id and v.actif and v.stock <= v.seuil_alerte_stock)
      select jsonb_build_object(
        'ruptures', (select count(*) from pieces where stock <= 0),
        'bas',      (select count(*) from pieces where stock > 0),
        'pieces',   coalesce((select jsonb_agg(jsonb_build_object(
                                 'produit_id', x.produit_id, 'produit', x.produit, 'declinaison', x.declinaison,
                                 'sku', x.sku, 'stock', x.stock, 'seuil', x.seuil_alerte_stock) order by x.stock, x.produit, x.sku)
                                from (select * from pieces order by stock, produit, sku limit 6) x), '[]'::jsonb)))
  );
end;
$$;

comment on function public.gestion_aujourdhui(uuid) is
  'Ce qui attend l''équipe aujourd''hui : commandes à confirmer, à rappeler, à préparer, en route, retraits prêts ; la journée (montants pour la direction) ; les modules ; le stock épuisé ou bas.';

revoke execute on function public.gestion_aujourdhui(uuid) from public, anon;
grant  execute on function public.gestion_aujourdhui(uuid) to authenticated;
