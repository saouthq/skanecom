-- =====================================================================
-- SkanEcom · jeu de démonstration : LES FAVORIS (migration 50)
-- =====================================================================
-- Maison Selma montre le cœur sur ses cartes et ses fiches ; Maymar et la
-- quincaillerie non (le réglage est coupé par défaut).
--
-- Un fichier à part : l'aperçu en ligne joue chaque jeu une fois
-- (supabase/functions/apercu-installer). Rejouable sans dommage.
-- =====================================================================

insert into public.reglages (boutique_id, cle, valeur) values
  ('00000000-0000-4000-8000-000000000003', 'catalogue.favoris', 'true')
on conflict (boutique_id, cle) do nothing;
