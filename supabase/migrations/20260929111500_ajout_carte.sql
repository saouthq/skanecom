-- =====================================================================
-- SkanEcom — 76 · L'AJOUT AU PANIER DEPUIS LA PHOTO D'UNE CARTE
-- =====================================================================
--
-- Dans une grille de photos (gabarit éditorial : Bento, Immersif…), un
-- « + » sur la photo de chaque carte met la pièce au panier sans ouvrir
-- sa fiche : une seule déclinaison, elle part d'un geste ; quelques-unes
-- (huit au plus), le « + » les propose sur la photo — la taille, la
-- couleur, le format —, un geste sur l'une la met au panier. Au-delà, ou
-- rien en stock, la carte mène à sa fiche, comme avant.
--
-- D'autres boutiques veulent qu'on lise la fiche avant d'acheter (une
-- pièce chère, une matière à expliquer) : « fais les deux et mets-le en
-- réglage ». Coupé par défaut.
--
-- Rien d'autre en base : le panier est celui de toujours, le prix et le
-- stock relus au tunnel.
-- =====================================================================

insert into plateforme.reglages_catalogue
  (cle, type_valeur, choix_possibles, defaut, groupe, module, public, libelle_fr, description_fr, position) values
  ('catalogue.ajout_carte', 'booleen', null, 'false', 'catalogue', null, true,
     'Ajout au panier depuis la carte',
     'Oui = un « + » sur la photo de chaque carte met la pièce au panier sans ouvrir sa fiche (sa déclinaison choisie sur la photo, huit au plus). Non = la carte mène à la fiche.', 34);
