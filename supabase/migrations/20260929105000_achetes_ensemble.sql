-- =====================================================================
-- SkanEcom — 51 · SOUVENT ACHETÉS ENSEMBLE
-- =====================================================================
--
-- « Vous aimerez aussi » montre des pièces du même rayon — des pièces qui
-- se remplacent. Ici, celles qui se COMPLÈTENT : achetées dans une même
-- commande qu'une autre (la valise et sa housse, la robe et ses sandales),
-- lues dans les commandes de la boutique des 180 derniers jours, hors
-- annulées et refusées. Sur la fiche, et dans le tiroir du panier.
--
-- Réglage de la boutique (catalogue.achetes_ensemble), coupé par défaut.
-- Rien de personnel n'en sort : des pièces du catalogue, et le nombre de
-- commandes qui les ont réunies.
-- =====================================================================

insert into plateforme.reglages_catalogue
  (cle, type_valeur, choix_possibles, defaut, groupe, module, public, libelle_fr, description_fr, position) values
  ('catalogue.achetes_ensemble', 'booleen', null, 'false', 'catalogue', null, true,
     'Souvent achetés ensemble',
     'Oui = la fiche et le panier proposent les pièces que les clients achètent avec celles-ci (d''après les commandes des 180 derniers jours), prêtes à ajouter. Non = seul « Vous aimerez aussi » (le même rayon) reste.', 33);

create index if not exists commande_lignes_variante_idx on public.commande_lignes (boutique_id, variante_id);

-- Les pièces achetées avec celles de p_slugs (une fiche : la sienne ; un
-- panier : les siennes), les plus souvent réunies d'abord, en vente et en
-- stock, jamais celles de p_slugs elles-mêmes.
create function public.achetes_ensemble(p_boutique_id uuid, p_slugs text[], p_limite integer default 4)
returns table (produit_id uuid, slug text, commandes integer)
language sql
stable
security definer
set search_path = ''
as $$
  with actif as (
    select coalesce((private.reglage(p_boutique_id, 'catalogue.achetes_ensemble'))::boolean, false) as oui
  ), demandes as (
    select p.id from public.produits p where p.boutique_id = p_boutique_id and p.slug = any(coalesce(p_slugs[1:20], '{}'))
  ), avec as (
    -- Les commandes qui contiennent l'une des pièces demandées.
    select distinct l.commande_id
      from public.commande_lignes l
      join public.variantes v on v.boutique_id = l.boutique_id and v.id = l.variante_id
      join public.commandes c on c.boutique_id = l.boutique_id and c.id = l.commande_id
     where l.boutique_id = p_boutique_id and v.produit_id in (select id from demandes)
       and c.statut not in ('annulee', 'refusee') and c.created_at > now() - interval '180 days'
  )
  select p.id, p.slug, count(distinct l.commande_id)::integer
    from avec a
    join public.commande_lignes l on l.boutique_id = p_boutique_id and l.commande_id = a.commande_id
    join public.variantes v on v.boutique_id = l.boutique_id and v.id = l.variante_id
    join public.produits p on p.boutique_id = v.boutique_id and p.id = v.produit_id and p.publie
   where (select oui from actif) and p.id not in (select id from demandes)
     and exists (select 1 from public.variantes w
                  where w.boutique_id = p.boutique_id and w.produit_id = p.id and w.actif and w.stock >= greatest(coalesce(w.quantite_min, 1), 1))
   group by p.id, p.slug
   order by count(distinct l.commande_id) desc, max(l.created_at) desc, p.slug
   limit least(greatest(coalesce(p_limite, 4), 1), 8)
$$;

revoke execute on function public.achetes_ensemble(uuid, text[], integer) from public;
grant  execute on function public.achetes_ensemble(uuid, text[], integer) to anon, authenticated;
