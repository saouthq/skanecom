-- =====================================================================
-- SkanEcom — 40 · LA NOTE DES AVIS SUR LES CARTES DU CATALOGUE
-- =====================================================================
-- Les avis publiés d'un produit (module avis, migration 39) résumés en une
-- note : la moyenne et le nombre. La vue de la vitrine la porte, donc les
-- rayons, la recherche, l'accueil et la fiche la lisent sans autre appel,
-- et la page servie l'affiche d'emblée (rien n'arrive après coup, rien ne
-- bouge). NULL sans le module, ou tant qu'aucun avis n'est publié.
--
-- La vue est lue sous les droits du visiteur (security_invoker) et la
-- table des avis lui est fermée : la note passe par une fonction qui ne
-- rend que ce résumé.
-- =====================================================================

create function public.note_produit(p_boutique_id uuid, p_produit_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when count(*) > 0 then jsonb_build_object('moyenne', round(avg(a.note), 1), 'total', count(*)) end
    from public.avis a
   where a.boutique_id = p_boutique_id and a.produit_id = p_produit_id and a.statut = 'publie'
     and private.avis_actif(p_boutique_id)
$$;

comment on function public.note_produit(uuid, uuid) is
  'La note d''un produit : moyenne et nombre de ses avis publiés ({moyenne, total}), NULL sans avis ou sans le module avis.';

grant execute on function public.note_produit(uuid, uuid) to anon, authenticated, service_role;

-- La vue de la vitrine (migration 35, reprise) : la note en dernière colonne.
create or replace view public.vitrine_produits
with (security_invoker = true) as
select
  p.boutique_id, p.id, p.slug, p.nom_fr, p.nom_ar, p.description_fr, p.description_ar,
  p.marque, p.mis_en_avant, p.position, p.created_at, p.meta_titre_fr, p.meta_description_fr,
  (select jsonb_build_object('id', c.id, 'parent_id', c.parent_id, 'slug', c.slug, 'nom_fr', c.nom_fr, 'nom_ar', c.nom_ar)
     from public.categories c
    where c.boutique_id = p.boutique_id and c.id = p.categorie_id and c.actif) as categorie,
  coalesce((select jsonb_agg(jsonb_build_object('cle', o.cle, 'label_fr', o.label_fr, 'label_ar', o.label_ar)
                             order by o.position, o.cle)
              from public.produit_options o
             where o.boutique_id = p.boutique_id and o.produit_id = p.id), '[]'::jsonb) as options,
  coalesce((select jsonb_agg(jsonb_build_object(
                     'id', v.id, 'sku', v.sku, 'options', v.options,
                     'prix_millimes', v.prix_millimes, 'prix_barre_millimes', v.prix_barre_millimes,
                     'stock', v.stock, 'seuil_alerte_stock', v.seuil_alerte_stock,
                     'poids_grammes', v.poids_grammes, 'image_chemin', v.image_chemin,
                     'quantite_min', v.quantite_min)
                   order by v.position, v.sku)
              from public.variantes v
             where v.boutique_id = p.boutique_id and v.produit_id = p.id and v.actif), '[]'::jsonb) as variantes,
  coalesce((select jsonb_agg(jsonb_build_object('chemin', i.chemin, 'variante_id', i.variante_id,
                                                'alt_fr', i.alt_fr, 'alt_ar', i.alt_ar)
                             order by i.position, i.chemin)
              from public.produit_images i
             where i.boutique_id = p.boutique_id and i.produit_id = p.id), '[]'::jsonb) as images,
  coalesce((select jsonb_agg(jsonb_build_object('cle', a.cle, 'label_fr', a.label_fr, 'label_ar', a.label_ar,
                                                'unite', a.unite, 'type', a.type, 'en_carte', a.en_carte,
                                                'valeur', p.caracteristiques ->> a.cle)
                             order by a.position, a.label_fr)
              from public.attributs a
             where a.boutique_id = p.boutique_id and p.caracteristiques ? a.cle), '[]'::jsonb) as caracteristiques,
  public.note_produit(p.boutique_id, p.id) as note
from public.produits p
where p.publie;

comment on view public.vitrine_produits is
  'Un produit publié avec son rayon, ses axes, ses variantes actives (minimum de commande compris), ses photos, sa fiche technique et la note de ses avis publiés, en une ligne. Lue par la fiche produit (filtrer par boutique_id ET slug) et par public.liste_produits.';
