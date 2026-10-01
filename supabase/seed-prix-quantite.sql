-- =====================================================================
-- SkanEcom · jeu de démonstration : LES PRIX PAR QUANTITÉ (migration 71)
-- =====================================================================
-- Yasmine Beauté vend son savon à l'huile d'olive (12,000 la pièce) par
-- trois et par six : 30,000 les trois, 54,000 les six. La fiche propose les
-- trois offres ; la commande les applique d'elle-même, quel que soit le
-- parfum.
--
-- Joué après seed-beaute.sql ; rejouable sans dommage.
-- =====================================================================

insert into public.prix_quantite (boutique_id, produit_id, quantite, prix_millimes)
select p.boutique_id, p.id, x.quantite, x.prix
  from public.produits p
  cross join (values (3, 30000::bigint), (6, 54000::bigint)) as x(quantite, prix)
 where p.boutique_id = '00000000-0000-4000-8000-000000000004' and p.slug = 'savon-huile-olive'
on conflict (boutique_id, produit_id, quantite) do nothing;
