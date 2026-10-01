-- =====================================================================
-- SkanEcom · jeu de démonstration : LES PIXELS PUBLICITAIRES (migration 63)
-- =====================================================================
-- Maison Selma a un pixel Meta et un pixel TikTok : sa vitrine demande
-- l'accord du visiteur, puis leur envoie ses pages vues, fiches regardées,
-- ajouts au panier et commandes. Les identifiants sont FICTIFS.
--
-- Ce jeu sert la base locale et la CI (outils/base-locale.sh,
-- supabase/config.toml), PAS l'aperçu en ligne : un visiteur de l'aperçu
-- qui accepterait enverrait des événements à un pixel qui n'existe pas
-- chez Meta ni chez TikTok. Les parcours chargent ces scripts depuis un
-- bouchon (application/essais), jamais depuis Internet.
-- =====================================================================

insert into public.reglages (boutique_id, cle, valeur) values
  ('00000000-0000-4000-8000-000000000003', 'pub.pixel_meta',   '"1000000000000003"'),
  ('00000000-0000-4000-8000-000000000003', 'pub.pixel_tiktok', '"CSELMA0000000000DEMO"')
on conflict (boutique_id, cle) do nothing;
