-- =====================================================================
-- CE QU'IL FAUT SAVOIR AVANT D'APPELER (07/11, parcours en vrai)
-- =====================================================================
-- La gérante passe un client en « surveillé », motif à l'appui (« a refusé
-- un colis ailleurs, adresse floue »), et laisse une note à l'équipe
-- (« préfère être appelé après 18 h »). L'employé chargé des appels ouvrait
-- la commande au téléphone : l'étape d'appel ne disait rien, « Surveillé »
-- tenait dans une pastille en bas de page, sans le pourquoi, et la note de
-- l'équipe n'y était pas — il appelait à l'aveugle.
--
-- La fiche de la commande rend désormais, pour le client : sa note
-- d'équipe, et, s'il est surveillé ou bloqué, le dernier motif de ce
-- niveau au journal (qui l'a posé, quand). Lisible par tout membre, comme
-- la fiche client.
-- =====================================================================

-- ---------------------------------------------------------------------
-- La fiche de la commande : la note et la vigilance du client (migration 112700, reprise)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gestion_commande(p_boutique_id uuid, p_numero text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_commande public.commandes;
  v_resultat jsonb;
begin
  if auth.uid() is null or not private.est_membre(p_boutique_id) then
    raise exception 'Réservé à l''équipe de la boutique' using errcode = 'insufficient_privilege', hint = 'role';
  end if;
  select * into v_commande from public.commandes c where c.boutique_id = p_boutique_id and c.numero = p_numero;
  if not found then
    return null;
  end if;

  select jsonb_build_object(
    'numero', c.numero, 'statut', c.statut, 'origine', c.origine, 'cree_le', c.created_at,
    'canal', c.canal, 'saisie_par', (select u.email from auth.users u where u.id = c.saisie_par), 'sur_place', c.sur_place,
    'mode_paiement', c.mode_paiement, 'statut_paiement', c.statut_paiement,
    'mode_livraison', c.mode_livraison,
    'retrait', case when c.mode_livraison = 'retrait' then private.magasin(c.boutique_id) end,
    'contact', jsonb_build_object('nom', c.contact_nom, 'telephone', c.contact_telephone, 'email', c.contact_email),
    'livraison', jsonb_build_object(
      'ligne1', c.livraison_ligne1, 'ligne2', c.livraison_ligne2, 'ville', c.livraison_ville,
      'code_postal', c.livraison_code_postal, 'gouvernorat', coalesce(g.nom_fr, c.livraison_gouvernorat),
      'zone', c.livraison_zone_nom),
    'sous_total_millimes', c.sous_total_millimes, 'frais_livraison_millimes', c.frais_livraison_millimes,
    'remise_millimes', c.remise_millimes, 'code_promo', c.code_promo, 'total_millimes', c.total_millimes,
    'transporteur', c.transporteur, 'numero_suivi', c.numero_suivi,
    'refus_origine', c.refus_origine, 'refus_commentaire', c.refus_commentaire, 'motif_annulation', c.motif_annulation,
    'note_client', c.note_client, 'note_interne', c.note_interne,
    'en_attente_arrivage', c.en_attente_arrivage,
    'arrivage_prevu', case when c.en_attente_arrivage then (select max(a.date_prevue) from public.commande_lignes l2
                         join public.arrivages a on a.boutique_id = l2.boutique_id and a.id = l2.precommande_arrivage_id
                        where l2.boutique_id = c.boutique_id and l2.commande_id = c.id
                          and l2.precommande and l2.precommande_servie_le is null) end,
    'confirmee_le', c.confirmee_at, 'expediee_le', c.expediee_at, 'livree_le', c.livree_at, 'cloturee_le', c.cloturee_at,
    'lignes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'produit_nom', l.produit_nom, 'variante_libelle', l.variante_libelle, 'sku', l.sku,
               'quantite', l.quantite, 'prix_unitaire_millimes', l.prix_unitaire_millimes,
               'total_ligne_millimes', l.total_ligne_millimes, 'lot', l.lot_nom, 'remise_lot_millimes', l.remise_lot_millimes, 'stock_restant', v.stock,
               'precommande', l.precommande, 'precommande_servie_le', l.precommande_servie_le,
               'image', coalesce(v.image_chemin,
                 (select i.chemin from public.produit_images i
                   where i.boutique_id = v.boutique_id and i.produit_id = v.produit_id
                   order by (i.variante_id is not distinct from v.id) desc, i.position, i.created_at limit 1)))
             order by l.created_at, l.produit_nom)
      from public.commande_lignes l
      left join public.variantes v on v.boutique_id = l.boutique_id and v.id = l.variante_id
      where l.boutique_id = c.boutique_id and l.commande_id = c.id), '[]'::jsonb),
    'historique', coalesce((
      select jsonb_agg(jsonb_build_object(
               'le', e.created_at, 'avant', e.statut_avant, 'apres', e.statut_apres,
               'origine_refus', e.origine_refus, 'commentaire', e.commentaire, 'auteur', u.email)
             order by e.created_at)
      from public.commande_evenements e
      left join auth.users u on u.id = e.auteur_id
      where e.boutique_id = c.boutique_id and e.commande_id = c.id), '[]'::jsonb),
    'appels', coalesce((
      select jsonb_agg(jsonb_build_object(
               'le', k.created_at, 'canal', k.canal, 'resultat', k.resultat, 'note', k.note, 'auteur', u.email)
             order by k.created_at)
      from public.confirmations k
      left join auth.users u on u.id = k.auteur_id
      where k.boutique_id = c.boutique_id and k.commande_id = c.id), '[]'::jsonb),
    'client', (
      select jsonb_build_object(
               'nom', cl.nom, 'telephone', cl.telephone, 'compte', cl.user_id is not null,
               'nb_commandes', cl.nb_commandes, 'nb_refus', cl.nb_refus, 'niveau_risque', cl.niveau_risque,
               'depuis', cl.created_at, 'note', nullif(btrim(coalesce(cl.note_interne, '')), ''),
               'vigilance', case when cl.niveau_risque <> 'normal' then (
                 select jsonb_build_object('motif', ja.apres ->> 'motif', 'le', ja.at,
                                           'auteur', (select u.email from auth.users u where u.id = ja.acteur))
                   from plateforme.journal_audit ja
                  where ja.boutique_id = cl.boutique_id and ja.action = 'clients.confiance' and ja.cible = cl.id::text
                    and ja.apres ->> 'niveau' = cl.niveau_risque
                  order by ja.at desc, ja.id desc limit 1) end)
      from public.clients cl where cl.boutique_id = c.boutique_id and cl.id = c.client_id),
    'autres', coalesce((
      select jsonb_agg(jsonb_build_object('numero', o.numero, 'statut', o.statut, 'cree_le', o.created_at,
                                          'total_millimes', o.total_millimes) order by o.created_at desc)
      from (select * from public.commandes o
            where o.boutique_id = c.boutique_id and o.id <> c.id
              and (o.contact_telephone = c.contact_telephone or (c.client_id is not null and o.client_id = c.client_id))
            order by o.created_at desc limit 5) o), '[]'::jsonb)
  )
  into v_resultat
  from public.commandes c
  left join public.gouvernorats g on g.code = c.livraison_gouvernorat
  where c.boutique_id = p_boutique_id and c.id = v_commande.id;

  return v_resultat;
end;
$function$;
