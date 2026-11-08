-- =====================================================================
-- Le point du livreur : ce qu'il doit, pour les colis cochés
-- =====================================================================
-- Joué au téléphone (08/11) : le soir, le livreur de Maymar revient ; la
-- gérante coche les colis livrés (« Expédiées » → « Marquer livrées,
-- payées ») et compte l'argent qu'il lui remet — en additionnant de tête
-- 156 + 266. La barre dit désormais la somme à encaisser des colis
-- cochés : la liste dit, pour chaque commande, si elle est déjà payée en
-- ligne (Konnect, montant reçu) — le livreur n'encaisse rien pour elle.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.gestion_liste_commandes(p_boutique_id uuid, p_etape text DEFAULT 'a_confirmer'::text, p_recherche text DEFAULT NULL::text, p_limite integer DEFAULT 50, p_decalage integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_etape    text := coalesce(nullif(p_etape, ''), 'a_confirmer');
  v_q        text := nullif(btrim(p_recherche), '');
  v_chiffres text := regexp_replace(coalesce(p_recherche, ''), '\D', '', 'g');
  v_statuts  public.statut_commande[];
  v_limite   integer := least(greatest(coalesce(p_limite, 50), 1), 100);
  v_decalage integer := greatest(coalesce(p_decalage, 0), 0);
  v_fifo     boolean := coalesce(nullif(p_etape, ''), 'a_confirmer') in ('a_confirmer', 'a_preparer', 'expediees', 'precommandes');
  v_resultat jsonb;
begin
  if auth.uid() is null or not private.est_membre(p_boutique_id) then
    raise exception 'Réservé à l''équipe de la boutique' using errcode = 'insufficient_privilege', hint = 'role';
  end if;
  v_statuts := case v_etape
    when 'a_confirmer' then '{a_arbitrer,recue}'
    when 'a_preparer'  then '{confirmee}'
    when 'precommandes' then '{a_arbitrer,recue,confirmee}'
    when 'expediees'   then '{expediee}'
    when 'cloturees'   then '{livree,refusee,annulee}'
    when 'toutes'      then '{a_arbitrer,recue,confirmee,expediee,livree,refusee,annulee}'
  end::public.statut_commande[];
  if v_statuts is null then
    raise exception 'Étape inconnue : %', v_etape using errcode = 'check_violation', hint = 'canal';
  end if;

  with choisies as (
    select c.*
    from public.commandes c
    where c.boutique_id = p_boutique_id
      and c.statut = any (v_statuts)
      and (v_etape <> 'a_preparer' or not c.en_attente_arrivage)
      and (v_etape <> 'precommandes' or c.en_attente_arrivage)
      and (v_q is null
           or c.numero ilike '%' || v_q || '%'
           or c.contact_nom ilike '%' || v_q || '%'
           or (char_length(v_chiffres) >= 3 and c.contact_telephone like '%' || v_chiffres || '%'))
  ), page as (
    select * from choisies
    order by
      case when v_fifo then created_at end asc, case when v_fifo then numero end asc,
      case when not v_fifo then created_at end desc, case when not v_fifo then numero end desc
    limit v_limite offset v_decalage
  )
  select jsonb_build_object(
    'etape', v_etape,
    'total', (select count(*) from choisies),
    'compteurs', (
      select jsonb_build_object(
        'a_confirmer', count(*) filter (where c.statut in ('a_arbitrer', 'recue')),
        'a_preparer',  count(*) filter (where c.statut = 'confirmee' and not c.en_attente_arrivage),
        'precommandes', count(*) filter (where c.en_attente_arrivage and c.statut in ('a_arbitrer', 'recue', 'confirmee')),
        'expediees',   count(*) filter (where c.statut = 'expediee'),
        'cloturees',   count(*) filter (where c.statut in ('livree', 'refusee', 'annulee')))
      from public.commandes c where c.boutique_id = p_boutique_id),
    'commandes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'numero', p.numero, 'statut', p.statut, 'cree_le', p.created_at,
        'contact_nom', p.contact_nom, 'contact_telephone', p.contact_telephone,
        'mode_livraison', p.mode_livraison, 'ville', p.livraison_ville, 'gouvernorat', coalesce(g.nom_fr, p.livraison_gouvernorat),
        'total_millimes', p.total_millimes, 'origine', p.origine,
        'payee_en_ligne', p.mode_paiement = 'konnect' and p.statut_paiement = 'paye',
        'arrivage_prevu', case when p.en_attente_arrivage then (
                            select max(a.date_prevue) from public.commande_lignes l
                              join public.arrivages a on a.boutique_id = l.boutique_id and a.id = l.precommande_arrivage_id
                             where l.boutique_id = p.boutique_id and l.commande_id = p.id
                               and l.precommande and l.precommande_servie_le is null) end,
        'articles', (select coalesce(sum(l.quantite), 0) from public.commande_lignes l
                     where l.boutique_id = p.boutique_id and l.commande_id = p.id),
        'premier_article', (select l.produit_nom from public.commande_lignes l
                            where l.boutique_id = p.boutique_id and l.commande_id = p.id
                            order by l.created_at, l.produit_nom limit 1),
        'appels', (select count(*) from public.confirmations k
                   where k.boutique_id = p.boutique_id and k.commande_id = p.id),
        'dernier_appel', (select k.resultat from public.confirmations k
                          where k.boutique_id = p.boutique_id and k.commande_id = p.id
                          order by k.created_at desc limit 1),
        'client', case when cl.id is null then null else jsonb_build_object(
                    'nb_commandes', cl.nb_commandes, 'nb_refus', cl.nb_refus,
                    'niveau_risque', cl.niveau_risque, 'compte', cl.user_id is not null) end
      ) order by
          case when v_fifo then p.created_at end asc, case when v_fifo then p.numero end asc,
          case when not v_fifo then p.created_at end desc, case when not v_fifo then p.numero end desc)
      from page p
      left join public.gouvernorats g on g.code = p.livraison_gouvernorat
      left join public.clients cl on cl.boutique_id = p.boutique_id and cl.id = p.client_id
    ), '[]'::jsonb)
  ) into v_resultat;

  return v_resultat;
end;
$function$;
