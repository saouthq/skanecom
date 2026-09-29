-- =====================================================================
-- SkanEcom — 23 · VITRINE : « MES COMMANDES », ET CE QUE LE CLIENT EN LIT
-- 29/09/2026 — étape 1, tâche « application » (docs/SUITE-DEV.md : « mes
-- commandes » dans le compte)
-- =====================================================================
--
-- Jusqu'ici, un client connecté (compte ouvert par code SMS) lisait ses
-- commandes, leurs lignes, leur historique et sa fiche client directement
-- par l'API, toutes colonnes comprises : la note interne de l'équipe, le
-- commentaire d'un refus, le motif d'une annulation, l'auteur de chaque
-- geste, son niveau de confiance (« surveillé »). La vitrine ne s'en
-- servait pas (elle passe par commande_suivie).
--
-- Désormais, le client ne lit plus ces tables : public.mes_commandes rend
-- ses commandes dans une boutique, avec ce qui le concerne seulement. Son
-- carnet d'adresses, lui, reste à lui (public.adresses, inchangé). L'équipe
-- garde sa lecture, boutique par boutique (RLS).

drop policy "commandes: le client lit les siennes" on public.commandes;
drop policy "lignes: le client lit celles de ses commandes" on public.commande_lignes;
drop policy "événements: le client lit ceux de ses commandes" on public.commande_evenements;
drop policy "clients: chacun lit sa fiche" on public.clients;


-- Les commandes du client connecté dans une boutique, la plus récente
-- d'abord : où en est chacune, ce qu'elle contient, où elle va (la ville,
-- ou le magasin), le suivi du transporteur. Rien de ce que l'équipe en écrit.
create function public.mes_commandes(p_boutique_id uuid, p_limite integer default 20)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(x.commande order by x.cree_le desc, x.numero desc), '[]'::jsonb)
  from (
    select c.created_at as cree_le, c.numero, jsonb_build_object(
      'numero',         c.numero,
      'statut',         c.statut,
      'cree_le',        c.created_at,
      'mode_livraison', c.mode_livraison,
      'ville',          case when c.mode_livraison = 'domicile' then c.livraison_ville end,
      'gouvernorat',    case when c.mode_livraison = 'domicile' then coalesce(g.nom_fr, c.livraison_gouvernorat) end,
      'magasin',        case when c.mode_livraison = 'retrait' then private.magasin(c.boutique_id) end,
      'total_millimes', c.total_millimes,
      'transporteur',   c.transporteur,
      'numero_suivi',   c.numero_suivi,
      'expediee_le',    c.expediee_at,
      'livree_le',      c.livree_at,
      'lignes', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'produit_nom', l.produit_nom, 'variante_libelle', l.variante_libelle, 'quantite', l.quantite,
                 'image', coalesce(v.image_chemin,
                   (select i.chemin from public.produit_images i
                     where i.boutique_id = v.boutique_id and i.produit_id = v.produit_id
                     order by (i.variante_id is not distinct from v.id) desc, i.position, i.created_at
                     limit 1)))
               order by l.created_at, l.produit_nom)
          from public.commande_lignes l
          left join public.variantes v on v.boutique_id = l.boutique_id and v.id = l.variante_id
         where l.boutique_id = c.boutique_id and l.commande_id = c.id), '[]'::jsonb)
    ) as commande
    from public.commandes c
    join plateforme.boutiques b on b.id = c.boutique_id and b.statut = 'active'
    left join public.gouvernorats g on g.code = c.livraison_gouvernorat
    where auth.uid() is not null
      and c.boutique_id = p_boutique_id
      and c.client_id in (select cl.id from public.clients cl
                           where cl.boutique_id = p_boutique_id and cl.user_id = auth.uid())
    order by c.created_at desc, c.numero desc
    limit least(greatest(coalesce(p_limite, 20), 1), 50)
  ) x;
$$;

comment on function public.mes_commandes(uuid, integer) is
  'Les commandes du client connecté dans une boutique active, la plus récente d''abord : statut, contenu, destination, suivi. Jamais les notes ni l''historique de l''équipe.';

revoke execute on function public.mes_commandes(uuid, integer) from public, anon;
grant  execute on function public.mes_commandes(uuid, integer) to authenticated, service_role;
