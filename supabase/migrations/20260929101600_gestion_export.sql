-- =====================================================================
-- SkanEcom — 17 · BACKOFFICE : L'EXPORT DES DONNÉES (PRD §6.2 B8)
-- =====================================================================
-- Les données sont à la boutique : elle les emporte quand elle veut, dans un
-- tableur (commandes, articles des commandes, clients, catalogue, journal du
-- stock). Chaque jeu est une liste de lignes à plat ; l'application en fait
-- un fichier CSV.
--
-- Réservé au propriétaire et à l'administrateur (les données des clients en
-- font partie), et tracé au journal d'audit : qui a exporté quoi, quand, et
-- combien de lignes.
-- =====================================================================

create function public.gestion_export(p_boutique_id uuid, p_quoi text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_lignes jsonb;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');

  case p_quoi
    when 'commandes' then
      select coalesce(jsonb_agg(jsonb_build_object(
               'numero', c.numero, 'date', c.created_at, 'statut', c.statut, 'origine', c.origine,
               'nom', c.contact_nom, 'telephone', c.contact_telephone, 'email', c.contact_email,
               'adresse', c.livraison_ligne1, 'complement', c.livraison_ligne2, 'ville', c.livraison_ville,
               'gouvernorat', coalesce(g.nom_fr, c.livraison_gouvernorat), 'code_postal', c.livraison_code_postal,
               'zone', c.livraison_zone_nom,
               'sous_total', c.sous_total_millimes, 'frais_livraison', c.frais_livraison_millimes,
               'remise', c.remise_millimes, 'total', c.total_millimes,
               'paiement', c.mode_paiement, 'statut_paiement', c.statut_paiement,
               'transporteur', c.transporteur, 'suivi', c.numero_suivi,
               'refus_origine', c.refus_origine, 'refus_commentaire', c.refus_commentaire,
               'motif_annulation', c.motif_annulation, 'note_client', c.note_client,
               'confirmee_le', c.confirmee_at, 'expediee_le', c.expediee_at, 'livree_le', c.livree_at,
               'conditions_acceptees_le', c.conditions_acceptees ->> 'le')
             order by c.created_at), '[]'::jsonb) into v_lignes
        from public.commandes c
        left join public.gouvernorats g on g.code = c.livraison_gouvernorat
       where c.boutique_id = p_boutique_id;

    when 'articles' then
      select coalesce(jsonb_agg(jsonb_build_object(
               'numero', c.numero, 'date', c.created_at, 'statut', c.statut,
               'produit', l.produit_nom, 'declinaison', l.variante_libelle, 'reference', l.sku,
               'quantite', l.quantite, 'prix_unitaire', l.prix_unitaire_millimes, 'total', l.total_ligne_millimes)
             order by c.created_at, l.created_at), '[]'::jsonb) into v_lignes
        from public.commande_lignes l
        join public.commandes c on c.boutique_id = l.boutique_id and c.id = l.commande_id
       where l.boutique_id = p_boutique_id;

    when 'clients' then
      select coalesce(jsonb_agg(jsonb_build_object(
               'nom', cl.nom, 'telephone', cl.telephone, 'email', cl.email, 'compte', cl.user_id is not null,
               'commandes', cl.nb_commandes, 'refus', cl.nb_refus, 'confiance', cl.niveau_risque,
               'depuis', cl.created_at, 'note', cl.note_interne)
             order by cl.created_at), '[]'::jsonb) into v_lignes
        from public.clients cl
       where cl.boutique_id = p_boutique_id;

    when 'catalogue' then
      select coalesce(jsonb_agg(jsonb_build_object(
               'produit', p.nom_fr, 'adresse', p.slug, 'en_vitrine', p.publie, 'marque', p.marque,
               'rayon', c.nom_fr, 'reference', v.sku, 'declinaison', private.libelle_variante(p_boutique_id, p.id, v.options),
               'prix', v.prix_millimes, 'prix_barre', v.prix_barre_millimes, 'stock', v.stock,
               'alerte_sous', v.seuil_alerte_stock, 'en_vente', v.actif, 'poids_grammes', v.poids_grammes)
             order by p.nom_fr, v.position, v.sku), '[]'::jsonb) into v_lignes
        from public.variantes v
        join public.produits p on p.boutique_id = v.boutique_id and p.id = v.produit_id
        left join public.categories c on c.boutique_id = p.boutique_id and c.id = p.categorie_id
       where v.boutique_id = p_boutique_id;

    when 'stock' then
      select coalesce(jsonb_agg(jsonb_build_object(
               'date', m.created_at, 'reference', v.sku, 'produit', p.nom_fr, 'motif', m.motif,
               'mouvement', m.delta, 'stock_apres', m.stock_apres, 'commande', c.numero,
               'auteur', u.email, 'commentaire', m.commentaire)
             order by m.created_at), '[]'::jsonb) into v_lignes
        from public.stock_mouvements m
        join public.variantes v on v.boutique_id = m.boutique_id and v.id = m.variante_id
        join public.produits p on p.boutique_id = v.boutique_id and p.id = v.produit_id
        left join public.commandes c on c.boutique_id = m.boutique_id and c.id = m.commande_id
        left join auth.users u on u.id = m.auteur_id
       where m.boutique_id = p_boutique_id;

    else
      raise exception 'Export inconnu : %', p_quoi using errcode = 'check_violation', hint = 'quoi';
  end case;

  perform private.console_trace(auth.uid(), p_boutique_id, 'export.' || p_quoi, null, null,
                                jsonb_build_object('lignes', jsonb_array_length(v_lignes)));
  return v_lignes;
end;
$$;

revoke execute on function public.gestion_export(uuid, text) from public, anon;
grant  execute on function public.gestion_export(uuid, text) to authenticated;
