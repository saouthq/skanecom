-- =====================================================================
-- SkanEcom — 38 · L'ACHAT EXPRESS DEPUIS LA FICHE
-- =====================================================================
-- Sur téléphone, beaucoup d'acheteurs veulent un article, pas un panier :
-- « Commander maintenant » sur la fiche mène droit au tunnel avec cet
-- article seul, le panier n'est pas touché. D'autres boutiques préfèrent
-- le panier (plusieurs articles, livraison offerte dès un seuil) : « fais
-- les deux et mets-le en réglage ». Coupé par défaut.
--
-- Rien d'autre en base : la commande passe par public.passer_commande,
-- comme celle d'un panier (mêmes prix, même stock, même confirmation).
-- =====================================================================

insert into plateforme.reglages_catalogue
  (cle, type_valeur, choix_possibles, defaut, groupe, module, public, libelle_fr, description_fr, position) values
  ('commande.achat_express', 'booleen', null, 'false', 'commande', null, true,
     'Achat express depuis la fiche',
     'Oui = un bouton « Commander maintenant » sur la fiche produit mène droit à la commande avec cet article seul, sans passer par le panier. Non = on passe par le panier.', 4);
