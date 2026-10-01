-- =====================================================================
-- SkanEcom · jeu de démonstration : LES PHOTOS DES AVIS (migration 52)
-- =====================================================================
-- Maison Selma recueille des photos avec les avis ; Maymar et la
-- quincaillerie non (le réglage est coupé par défaut). Une cliente livrée
-- du sac de voyage (commande SEL-2026-00801, jeu seed-ensemble.sql) le
-- note avec deux photos : l'anse et une poche. Ce sont des recadrages de la
-- photo du sac (supabase/fichiers-demo/maison-selma/avis/, aucune personne
-- dessus) : un avis de démonstration n'est pas celui d'un vrai client, et
-- une photo de mannequin n'est jamais présentée comme celle d'un client.
--
-- Un fichier à part : l'aperçu en ligne joue chaque jeu une fois
-- (supabase/functions/apercu-installer). Rejouable sans dommage.
-- =====================================================================

insert into public.reglages (boutique_id, cle, valeur) values
  ('00000000-0000-4000-8000-000000000003', 'avis.photos', 'true')
on conflict (boutique_id, cle) do nothing;

do $$
declare
  s constant uuid := '00000000-0000-4000-8000-000000000003';
  v_ligne    record;
  v_avis     uuid;
begin
  select l.id as ligne_id, l.variante_libelle, c.id as commande_id, c.client_id, c.contact_nom, c.livree_at, v.produit_id
    into v_ligne
    from public.commandes c
    join public.commande_lignes l on l.boutique_id = c.boutique_id and l.commande_id = c.id
    join public.variantes v on v.boutique_id = l.boutique_id and v.id = l.variante_id
   where c.boutique_id = s and c.numero = 'SEL-2026-00801' and c.statut = 'livree' and v.sku = 'SEL19-COG';
  if not found or exists (select 1 from public.avis a where a.boutique_id = s and a.ligne_id = v_ligne.ligne_id) then
    return;
  end if;
  insert into public.avis (boutique_id, produit_id, commande_id, ligne_id, client_id, note, texte, auteur, variante_libelle,
                           statut, modere_le, created_at)
  values (s, v_ligne.produit_id, v_ligne.commande_id, v_ligne.ligne_id, v_ligne.client_id, 5,
          'Le cuir est épais et sent bon, les coutures sont nettes. Il tient un week-end entier, les poches avant sont pratiques.',
          private.nom_public(v_ligne.contact_nom), v_ligne.variante_libelle, 'publie',
          v_ligne.livree_at + interval '3 days', v_ligne.livree_at + interval '2 days')
  returning id into v_avis;
  insert into public.avis_photos (boutique_id, avis_id, chemin, largeur, hauteur, position, created_at) values
    (s, v_avis, 'maison-selma/avis/sac-anse.webp',  640, 640, 0, v_ligne.livree_at + interval '2 days'),
    (s, v_avis, 'maison-selma/avis/sac-poche.webp', 540, 540, 1, v_ligne.livree_at + interval '2 days');
end
$$;
