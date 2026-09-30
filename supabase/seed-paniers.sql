-- =====================================================================
-- SkanEcom · jeu de démonstration : LES PANIERS ABANDONNÉS (migration 48)
-- =====================================================================
-- Maison Selma relance ses paniers ; Maymar et la quincaillerie non (le
-- réglage est coupé par défaut). Deux paniers laissés (il y a trois heures,
-- et hier), un relancé il y a trois jours sans commande depuis. Numéros de
-- démonstration.
--
-- Un fichier à part : l'aperçu en ligne joue chaque jeu une fois
-- (supabase/functions/apercu-installer). Rejouable sans dommage.
-- =====================================================================

insert into public.reglages (boutique_id, cle, valeur) values
  ('00000000-0000-4000-8000-000000000003', 'commande.relance_paniers', 'true')
on conflict (boutique_id, cle) do nothing;

insert into public.paniers_suivis (boutique_id, telephone, lignes, sous_total_millimes, articles, created_at, updated_at, relance_le)
select s, p.telephone, p.lignes, p.sous_total, p.articles, now() - p.il_y_a - interval '10 minutes', now() - p.il_y_a,
       case when p.relance then now() - p.il_y_a + interval '20 hours' end
  from (select '00000000-0000-4000-8000-000000000003'::uuid as s) b
 cross join lateral (values
   ('+21620700101', interval '3 hours', false, 'SEL01-TER-M', 1, 'SEL09-VER-M', 1),
   ('+21620700102', interval '26 hours', false, 'SEL02-ECR-S', 1, null, 0),
   ('+21620700103', interval '4 days', true, 'SEL04-VIC-M', 2, null, 0)
 ) as x(telephone, il_y_a, relance, sku1, q1, sku2, q2)
 cross join lateral (
   select x.telephone, x.il_y_a, x.relance,
          jsonb_agg(jsonb_build_object('variante_id', v.id, 'quantite', q.qte) order by q.rang) as lignes,
          sum(v.prix_millimes * q.qte)::bigint as sous_total, sum(q.qte)::integer as articles
     from (values (1, x.sku1, x.q1), (2, x.sku2, x.q2)) as q(rang, sku, qte)
     join public.variantes v on v.boutique_id = b.s and v.sku = q.sku
    where q.qte > 0
 ) p
 where not exists (select 1 from public.paniers_suivis y where y.boutique_id = b.s);
