-- =====================================================================
-- 140 · Modifier une commande pas encore partie : chiffrée sans rien
--       écrire, puis enregistrée — stock rendu puis réservé, journal tenu
-- =====================================================================
begin;
\ir outils.psql

select plan(10);

reset role;
create temp table t_ref as select (select numero from public.commandes where id = tests.id('commande_a')) as numero,
                                  (select stock from public.variantes where id = tests.id('variante_a')) as stock;
grant select on t_ref to authenticated;
create temp table t_res (n int, r jsonb);
grant all on t_res to authenticated;

select tests.connecte('confirm_a');
insert into t_res select 1, public.gestion_modifier_commande(tests.id('A'), (select numero from t_ref),
  jsonb_build_array(jsonb_build_object('variante_id', tests.id('variante_a'), 'quantite', 2)), true);
select is((select r ->> 'ok' from t_res where n = 1), 'true', 'deux au lieu d''une : le nouveau chiffrage est rendu');
select is((select (r ->> 'sous_total_millimes')::bigint from t_res where n = 1), 378000::bigint, 'le sous-total de deux valises (2 × 189,000)');
select is((select r ->> 'enregistree' from t_res where n = 1), 'false', 'simulé : rien n''est enregistré');
reset role;
select is((select stock from public.variantes where id = tests.id('variante_a')), (select stock from t_ref), 'simulé : le stock n''a pas bougé');

select tests.connecte('confirm_a');
insert into t_res select 2, public.gestion_modifier_commande(tests.id('A'), (select numero from t_ref),
  jsonb_build_array(jsonb_build_object('variante_id', tests.id('variante_a'), 'quantite', 2)), false, (select (r ->> 'total_millimes')::bigint from t_res where n = 1));
select is((select r ->> 'enregistree' from t_res where n = 2), 'true', 'enregistré, au total vu');
reset role;
select is((select sum(quantite)::int from public.commande_lignes where commande_id = tests.id('commande_a')), 2, 'la commande a deux valises');
select is((select stock from public.variantes where id = tests.id('variante_a')), (select stock - 1 from t_ref), 'le stock : l''unique rendue, deux réservées (−1)');
select ok(exists (select 1 from public.commande_evenements where commande_id = tests.id('commande_a') and commentaire like 'Modifiée : 1 × Valise cabine → 2 × %'),
  'le journal de la commande garde avant → après');

select tests.connecte('confirm_a');
select is((select public.gestion_modifier_commande(tests.id('A'), (select numero from t_ref),
  jsonb_build_array(jsonb_build_object('variante_id', tests.id('variante_a'), 'quantite', 50)), true) ->> 'raison'), 'stock', 'plus que le stock : refusé, la raison dite');

select tests.connecte('prepa_a');
select throws_ok($$ select public.gestion_modifier_commande(tests.id('A'), (select numero from t_ref), '[]'::jsonb, true) $$,
  '42501', null, 'la préparation ne modifie pas une commande');

select * from finish();
rollback;
