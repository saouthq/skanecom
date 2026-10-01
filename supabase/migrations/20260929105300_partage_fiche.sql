-- =====================================================================
-- SkanEcom — 54 · PARTAGER UNE FICHE
-- =====================================================================
--
-- En Tunisie, une pièce se recommande d'abord dans une conversation :
-- WhatsApp, Messenger. Sur la fiche, « Partager » : au téléphone, la
-- feuille de partage du système ; ailleurs, WhatsApp, Facebook, ou le lien
-- copié. L'aperçu du lien (photo, nom, prix) vient des balises de la fiche.
--
-- Réglage de la boutique (vitrine.partage), coupé par défaut. Rien n'est
-- gardé : le partage se fait dans le navigateur du client.
-- =====================================================================

insert into plateforme.reglages_catalogue
  (cle, type_valeur, choix_possibles, defaut, groupe, module, public, libelle_fr, description_fr, position) values
  ('vitrine.partage', 'booleen', null, 'false', 'vitrine', null, true,
     'Partager une fiche',
     'Oui = la fiche propose « Partager » : la feuille de partage du téléphone, ou WhatsApp, Facebook et le lien à copier. Non = pas de bouton.', 35);
