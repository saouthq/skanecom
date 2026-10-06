-- =====================================================================
-- « Mes commandes » lit la commande comme le suivi : l'arrivage d'une
-- précommande, et le paiement en ligne reçu
-- =====================================================================
-- Constaté à la recette (06/10) : une cliente qui précommande et paie par
-- carte ouvre « Mes commandes » ; sa commande n'y dit ni qu'elle attend
-- l'arrivage du 18 octobre, ni qu'elle est payée. public.mes_commandes
-- (migration …_sav) bâtissait sa propre vue de la commande, que la
-- migration …_precommandes n'avait pas reprise : la date d'arrivage n'y
-- arrivait jamais, alors que l'écran sait l'afficher.
--
-- Désormais une seule vue de la commande pour l'acheteur,
-- private.commande_pour_acheteur (le suivi sans compte la lit déjà) :
-- « Mes commandes » la rend pour chacune de ses commandes. Elle dit en plus
-- si la commande est payée en ligne (Konnect, montant reçu) — jamais la
-- référence du paiement ni rien de ce que l'équipe écrit.
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

-- Les commandes du client connecté dans cette boutique, les plus récentes
-- d'abord : chacune telle que l'acheteur la lit (ci-dessus).
create or replace function public.mes_commandes(p_boutique_id uuid, p_limite integer default 20)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(private.commande_pour_acheteur(x.boutique_id, x.id) order by x.created_at desc, x.numero desc), '[]'::jsonb)
  from (
    select c.boutique_id, c.id, c.created_at, c.numero
    from public.commandes c
    join plateforme.boutiques b on b.id = c.boutique_id and b.statut = 'active'
    where auth.uid() is not null
      and c.boutique_id = p_boutique_id
      and c.client_id in (select cl.id from public.clients cl
                           where cl.boutique_id = p_boutique_id and cl.user_id = auth.uid())
    order by c.created_at desc, c.numero desc
    limit least(greatest(coalesce(p_limite, 20), 1), 50)
  ) x;
$$;
