-- =====================================================================
-- SkanEcom — 18 · BACKOFFICE : LES BORDEREAUX DE LIVRAISON (PRD §6.2 B5)
-- =====================================================================
-- Avant qu'un transporteur soit branché, le colis part avec un bordereau
-- imprimé par la boutique : qui expédie, qui reçoit, le numéro de la
-- commande, ce qu'elle contient, et le montant que le livreur encaisse.
-- Un bordereau à l'unité (depuis la fiche d'une commande), ou tous ceux des
-- commandes à préparer d'un coup.
--
-- Toute l'équipe peut imprimer (la préparation en premier).
-- =====================================================================

create function public.gestion_bordereaux(
  p_boutique_id uuid,
  p_numeros     text[] default null,
  p_etape       text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id);
  if p_numeros is null and (p_etape is null or p_etape not in ('a_preparer', 'expediees')) then
    raise exception 'Choisissez des commandes, ou une étape (à préparer, expédiées)' using errcode = 'check_violation', hint = 'choix';
  end if;
  if cardinality(coalesce(p_numeros, '{}')) > 200 then
    raise exception '200 bordereaux au plus à la fois' using errcode = 'check_violation', hint = 'limite';
  end if;

  return jsonb_build_object(
    'expediteur', jsonb_build_object(
      'nom', (select b.nom from plateforme.boutiques b where b.id = p_boutique_id),
      'raison_sociale', nullif(private.reglage(p_boutique_id, 'legal.raison_sociale') #>> '{}', ''),
      'adresse', nullif(private.reglage(p_boutique_id, 'legal.adresse') #>> '{}', ''),
      'telephone', nullif(private.reglage(p_boutique_id, 'contact.telephone') #>> '{}', '')),
    'commandes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'numero', c.numero, 'statut', c.statut, 'cree_le', c.created_at,
               'nom', c.contact_nom, 'telephone', c.contact_telephone,
               'ligne1', c.livraison_ligne1, 'ligne2', c.livraison_ligne2, 'ville', c.livraison_ville,
               'gouvernorat', coalesce(g.nom_fr, c.livraison_gouvernorat), 'code_postal', c.livraison_code_postal,
               'zone', c.livraison_zone_nom, 'note_client', c.note_client,
               'transporteur', c.transporteur, 'suivi', c.numero_suivi,
               'paiement', c.mode_paiement, 'statut_paiement', c.statut_paiement, 'total', c.total_millimes,
               'lignes', coalesce((
                 select jsonb_agg(jsonb_build_object('produit', l.produit_nom, 'declinaison', l.variante_libelle,
                                                     'reference', l.sku, 'quantite', l.quantite)
                                  order by l.created_at, l.produit_nom)
                   from public.commande_lignes l where l.boutique_id = c.boutique_id and l.commande_id = c.id), '[]'::jsonb))
             order by c.created_at, c.numero)
        from public.commandes c
        left join public.gouvernorats g on g.code = c.livraison_gouvernorat
       where c.boutique_id = p_boutique_id
         and (case
                when p_numeros is not null then c.numero = any (p_numeros)
                when p_etape = 'a_preparer' then c.statut = 'confirmee'
                else c.statut = 'expediee'
              end)), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.gestion_bordereaux(uuid, text[], text) from public, anon;
grant  execute on function public.gestion_bordereaux(uuid, text[], text) to authenticated;
