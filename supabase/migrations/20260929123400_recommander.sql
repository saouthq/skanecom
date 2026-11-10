-- =====================================================================
-- COMMANDER À NOUVEAU (10/11, parcours en vrai)
-- =====================================================================
-- Une cliente rachète son sérum, un artisan ses forets : « Mes commandes »
-- n'offrait que de relire. public.recommander rend les lignes d'une de SES
-- commandes, relues dans le catalogue d'AUJOURD'HUI : la déclinaison
-- encore en vente (produit en vitrine, déclinaison active, du stock), son
-- prix et son stock du jour. Le navigateur les remet au panier ; le panier
-- et le tunnel revérifient tout, comme pour un ajout ordinaire.
-- Rien n'est écrit ici : c'est une lecture.
-- =====================================================================

create or replace function public.recommander(p_boutique_id uuid, p_numero text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'variante_id', v.id,
      'produit_slug', p.slug,
      'sku', v.sku,
      'libelle', l.produit_nom || coalesce(' · ' || nullif(l.variante_libelle, ''), ''),
      'quantite', l.quantite,
      'quantite_min', v.quantite_min,
      'prix_millimes', v.prix_millimes,
      'stock', v.stock,
      'image', coalesce(v.image_chemin,
                        (select i.chemin from public.produit_images i
                          where i.boutique_id = p.boutique_id and i.produit_id = p.id
                          order by (i.variante_id = v.id) desc nulls last, i.position limit 1)),
      'disponible', (v.actif and p.publie and v.stock > 0)
    ) order by l.created_at, l.id), '[]'::jsonb)
  from public.commandes c
  join plateforme.boutiques b on b.id = c.boutique_id and b.statut = 'active'
  join public.commande_lignes l on l.commande_id = c.id and l.boutique_id = c.boutique_id
  join public.variantes v on v.id = l.variante_id and v.boutique_id = c.boutique_id
  join public.produits p on p.id = v.produit_id and p.boutique_id = c.boutique_id
  where auth.uid() is not null
    and c.boutique_id = p_boutique_id
    and c.numero = p_numero
    and c.client_id in (select cl.id from public.clients cl
                         where cl.boutique_id = p_boutique_id and cl.user_id = auth.uid());
$$;

comment on function public.recommander(uuid, text) is
  'Les lignes d''une commande de l''acheteur connecté, relues dans le catalogue du jour (en vente, prix, stock) : « Commander à nouveau ».';
revoke execute on function public.recommander(uuid, text) from public, anon;
grant  execute on function public.recommander(uuid, text) to authenticated, service_role;
