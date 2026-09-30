-- =====================================================================
-- SkanEcom — 49 · LE PANIER D'UNE RELANCE
-- =====================================================================
--
-- Suite des paniers abandonnés (migration 48) : le message de relance porte
-- un lien vers le panier, qui le remet dans le navigateur de la cliente —
-- celui où elle ouvre WhatsApp, pas forcément celui où elle l'avait rempli.
-- =====================================================================

-- Le message de relance porte l'adresse /panier/<id> de la vitrine :
-- ouverte sur n'importe quel appareil, elle montre le panier (les pièces,
-- leur prix du jour, ce qui n'est plus disponible) et le remet dans le
-- navigateur pour finir la commande. L'identifiant, tiré au hasard, est la
-- seule clé ; ce qu'il ouvre ne dit rien de la personne (ni nom, ni
-- numéro), seulement des pièces du catalogue.
create function public.panier_a_reprendre(p_boutique_id uuid, p_panier_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('lignes', coalesce((
           select jsonb_agg(jsonb_build_object(
                    'variante_id', va.id, 'produit_slug', pr.slug, 'sku', va.sku,
                    'produit', coalesce(pr.nom_fr, pr.nom_ar),
                    'libelle', private.libelle_variante(p.boutique_id, pr.id, va.options),
                    'quantite', (l ->> 'quantite')::integer,
                    'prix_millimes', va.prix_millimes,
                    'stock', va.stock,
                    'quantite_min', greatest(coalesce(va.quantite_min, 1), 1),
                    'disponible', va.actif and va.stock >= greatest(coalesce(va.quantite_min, 1), 1),
                    'image', coalesce(va.image_chemin,
                               (select i.chemin from public.produit_images i
                                 where i.boutique_id = va.boutique_id and i.produit_id = pr.id
                                 order by (i.variante_id is not distinct from va.id) desc, i.position, i.created_at limit 1)))
                  order by n)
             from jsonb_array_elements(p.lignes) with ordinality as e(l, n)
             join public.variantes va on va.boutique_id = p.boutique_id and va.id = (l ->> 'variante_id')::uuid
             join public.produits pr on pr.boutique_id = va.boutique_id and pr.id = va.produit_id and pr.publie), '[]'::jsonb))
    from public.paniers_suivis p
    join plateforme.boutiques b on b.id = p.boutique_id and b.statut = 'active'
   where p.boutique_id = p_boutique_id and p.id = p_panier_id
$$;

revoke execute on function public.panier_a_reprendre(uuid, uuid) from public;
grant  execute on function public.panier_a_reprendre(uuid, uuid) to anon, authenticated;
