-- =====================================================================
-- SkanEcom · jeu de démonstration : LA STRUCTURE IMMERSIVE (migration 69)
-- =====================================================================
-- Maison Selma passe en Immersif : son ouverture plein écran, puis la pièce
-- de la saison (sa robe à bretelles, achetable depuis l'accueil, dite par
-- sa propre description), un lookbook — la photo du combishort, un point
-- posé sur la pièce portée — et une phrase de la maison en manifeste,
-- glissés entre ses sections (ses textes, ses photos, ses avis et ses
-- questions gardés).
--
-- Le lookbook ne pointe que ce que la photo montre vraiment : le combishort
-- de la boutique, porté. Le sac de la photo n'est pas au catalogue : pas
-- de point dessus.
--
-- Joué après seed-accueil.sql ; rejouable sans dommage (rien ne se fait
-- deux fois).
-- =====================================================================

update public.themes t
   set code = 'immersif',
       sections = (
         select jsonb_agg(s.x order by s.o)
           from (select e.v as x, e.o * 10 as o
                   from jsonb_array_elements(t.sections) with ordinality e(v, o)
                 union all select '{"type": "piece", "produit": "robe-bretelles-terracotta"}'::jsonb, 15
                 union all select '{"type": "lookbook",
                                    "image": {"chemin": "maison-selma/produits/combinaison-fleurie-1200.webp"},
                                    "textes": {"etiquette_fr": "Le look de la semaine", "titre_fr": "L''imprimé, en ville",
                                               "image_alt_fr": "Femme en combishort noir à fleurs devant un rideau métallique"},
                                    "points": [{"x": 46, "y": 32, "produit": "combishort-fleurs"}]}'::jsonb, 35
                 union all select '{"type": "texte",
                                    "textes": {"etiquette_fr": "La maison · Tunis", "titre_fr": "Choisies à Tunis, faites pour durer."}}'::jsonb, 52) s)
 where t.boutique_id = '00000000-0000-4000-8000-000000000003'
   and t.code <> 'immersif'
   and t.sections is not null
   and not t.sections @> '[{"type": "lookbook"}]';
