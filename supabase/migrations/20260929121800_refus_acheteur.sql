-- =====================================================================
-- Un colis revenu : l'acheteur sait pourquoi, sans être accusé
-- =====================================================================
-- Joué au téléphone (08/11) : un client de Maymar, absent deux fois au
-- passage du livreur ; la gérante enregistre « Client injoignable à la
-- livraison ». En suivant sa commande, le client lisait « Refusée à la
-- livraison » — deux fois (la pastille, puis la phrase) — alors qu'il
-- n'a rien refusé, et rien sur son colis ni sur la façon de le recevoir.
--
-- La vue de la commande pour l'acheteur (« Mes commandes », le suivi sans
-- compte) donne désormais l'origine du refus : client, livreur,
-- injoignable, autre. Le code seul : le commentaire reste à l'équipe.
-- =====================================================================

create or replace function private.commande_pour_acheteur(p_boutique_id uuid, p_commande_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'numero',         c.numero,
    'statut',         c.statut,
    'cree_le',        c.created_at,
    'mode_livraison', c.mode_livraison,
    'ville',          case when c.mode_livraison = 'domicile' then c.livraison_ville end,
    'gouvernorat',    case when c.mode_livraison = 'domicile' then coalesce(g.nom_fr, c.livraison_gouvernorat) end,
    'magasin',        case when c.mode_livraison = 'retrait' then private.magasin(c.boutique_id) end,
    'total_millimes', c.total_millimes,
    'payee_en_ligne', c.mode_paiement = 'konnect' and c.statut_paiement = 'paye',
    'transporteur',   c.transporteur,
    'numero_suivi',   c.numero_suivi,
    'expediee_le',    c.expediee_at,
    'livree_le',      c.livree_at,
    'refus_origine',  case when c.statut = 'refusee' then c.refus_origine::text end,
    'arrivage_prevu', case when c.en_attente_arrivage then (select max(a.date_prevue) from public.commande_lignes l2
                         join public.arrivages a on a.boutique_id = l2.boutique_id and a.id = l2.precommande_arrivage_id
                        where l2.boutique_id = c.boutique_id and l2.commande_id = c.id
                          and l2.precommande and l2.precommande_servie_le is null) end,
    'lignes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', l.id, 'produit_nom', l.produit_nom, 'variante_libelle', l.variante_libelle, 'quantite', l.quantite,
               'precommande', l.precommande and l.precommande_servie_le is null,
               'image', coalesce(v.image_chemin,
                 (select i.chemin from public.produit_images i
                   where i.boutique_id = v.boutique_id and i.produit_id = v.produit_id
                   order by (i.variante_id is not distinct from v.id) desc, i.position, i.created_at
                   limit 1)))
             order by l.created_at, l.produit_nom)
        from public.commande_lignes l
        left join public.variantes v on v.boutique_id = l.boutique_id and v.id = l.variante_id
       where l.boutique_id = c.boutique_id and l.commande_id = c.id), '[]'::jsonb))
  from public.commandes c
  left join public.gouvernorats g on g.code = c.livraison_gouvernorat
  where c.boutique_id = p_boutique_id and c.id = p_commande_id;
$$;
