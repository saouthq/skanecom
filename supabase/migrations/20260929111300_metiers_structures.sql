-- =====================================================================
-- SkanEcom — 74 · CHAQUE MÉTIER, SA STRUCTURE
-- =====================================================================
--
-- Les préréglages par métier (migration 57) posaient un gabarit, éditorial
-- ou technique. Les structures existent maintenant (migrations 68 à 72) :
-- chaque métier reçoit celle qui lui va, avec les sections de son accueil
-- (inchangées : toutes les structures rendent tous les types de section).
--
--   · mode, bijoux              → Immersif (la photo d'abord, le lookbook)
--   · high-tech, outillage      → Commerce (la recherche d'abord, la comparaison)
--   · maison, épicerie fine     → Bento (la mosaïque)
--   · beauté, bagages           → éditorial (inchangés)
--
-- Une boutique déjà créée garde la sienne : seul le préréglage change.
-- Le Monoproduit se choisit à part (une boutique d'une pièce n'est pas un
-- métier), comme toute structure dans l'éditeur.

update plateforme.metiers set definition = jsonb_set(definition, '{theme}', '"immersif"') where code in ('mode', 'bijoux');
update plateforme.metiers set definition = jsonb_set(definition, '{theme}', '"commerce"') where code in ('high_tech', 'outillage');
update plateforme.metiers set definition = jsonb_set(definition, '{theme}', '"bento"') where code in ('maison', 'alimentation');
