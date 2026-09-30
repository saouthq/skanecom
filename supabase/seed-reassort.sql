-- =====================================================================
-- SkanEcom · jeu de démonstration : « PRÉVENEZ-MOI DE SON RETOUR » (47)
-- =====================================================================
-- Maison Selma et la quincaillerie proposent l'alerte ; Maymar non (le
-- réglage est coupé par défaut : c'est au client de le décider).
--
-- Chez Selma, des clientes attendent la robe midi en XL et les mocassins
-- en 44 (épuisés) ; la chemise en popeline M est revenue au dernier
-- arrivage : deux personnes à prévenir. À la quincaillerie, deux artisans
-- attendent les forets de 10 mm. Numéros et adresses de démonstration.
--
-- Un fichier à part : l'aperçu en ligne joue chaque jeu une fois
-- (supabase/functions/apercu-installer). Rejouable sans dommage.
-- =====================================================================

insert into public.reglages (boutique_id, cle, valeur) values
  ('00000000-0000-4000-8000-000000000003', 'catalogue.prevenir_retour', 'true'),
  ('00000000-0000-4000-8000-000000000002', 'catalogue.prevenir_retour', 'true')
on conflict (boutique_id, cle) do nothing;

insert into public.alertes_retour (boutique_id, variante_id, telephone, email, statut, created_at, disponible_le)
select v.boutique_id, v.id, a.telephone, a.email, a.statut, now() - a.il_y_a, case when a.statut = 'a_prevenir' then now() - interval '2 hours' end
  from (values
    ('00000000-0000-4000-8000-000000000003'::uuid, 'SEL03-GRI-XL', '+21620400101', null::text, 'attend', interval '9 days'),
    ('00000000-0000-4000-8000-000000000003'::uuid, 'SEL03-GRI-XL', '+21620400102', null::text, 'attend', interval '4 days'),
    ('00000000-0000-4000-8000-000000000003'::uuid, 'SEL03-GRI-XL', null::text, 'amira.demo@exemple.tn', 'attend', interval '1 day 3 hours'),
    ('00000000-0000-4000-8000-000000000003'::uuid, 'SEL18-NOI-44', '+21620400103', null::text, 'attend', interval '6 days'),
    ('00000000-0000-4000-8000-000000000003'::uuid, 'SEL12-BLE-M', '+21620400104', null::text, 'a_prevenir', interval '12 days'),
    ('00000000-0000-4000-8000-000000000003'::uuid, 'SEL12-BLE-M', null::text, 'yasmine.demo@exemple.tn', 'a_prevenir', interval '8 days'),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'FC-10', '+21698400105', null::text, 'attend', interval '5 days'),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'FC-10', '+21655400106', null::text, 'attend', interval '2 days')
  ) as a(boutique_id, sku, telephone, email, statut, il_y_a)
  join public.variantes v on v.boutique_id = a.boutique_id and v.sku = a.sku
 where not exists (select 1 from public.alertes_retour x where x.boutique_id = a.boutique_id);
