-- =====================================================================
-- 141 · Changer l'adresse d'une commande pas encore partie : les frais
--       du nouveau gouvernorat, vus avant d'enregistrer ; journal tenu
-- =====================================================================
begin;
\ir outils.psql

select plan(7);

reset role;
insert into public.zones_livraison (id, boutique_id, nom_fr, frais_millimes) values (tests.nouvel_id('zone_a_sud'), tests.id('A'), 'Sud', 9000);
insert into public.zones_gouvernorats (boutique_id, gouvernorat_code, zone_id) values (tests.id('A'), 'sfax', tests.id('zone_a_sud'));
update public.commandes set frais_livraison_millimes = 6000, total_millimes = sous_total_millimes + 6000 where id = tests.id('commande_a');
create temp table t_ref as select numero, total_millimes from public.commandes where id = tests.id('commande_a');
grant select on t_ref to authenticated;
create temp table t_res (n int, r jsonb);
grant all on t_res to authenticated;

select tests.connecte('confirm_a');
insert into t_res select 1, public.gestion_modifier_livraison(tests.id('A'), (select numero from t_ref),
  '{"ligne1": "12 rue Habib Thameur", "ville": "Sfax", "gouvernorat": "sfax", "code_postal": "3000"}'::jsonb, true);
select is((select (r ->> 'frais_livraison_millimes')::bigint from t_res where n = 1), 9000::bigint, 'Sfax : les frais de sa zone (9,000)');
select is((select (r ->> 'total_millimes')::bigint - (select total_millimes from t_ref) from t_res where n = 1), 3000::bigint, 'le total monte de la différence (+3,000)');
reset role;
select is((select livraison_ville from public.commandes where id = tests.id('commande_a')), 'Tunis', 'simulé : rien n''est écrit');

select tests.connecte('confirm_a');
insert into t_res select 2, public.gestion_modifier_livraison(tests.id('A'), (select numero from t_ref),
  '{"ligne1": "12 rue Habib Thameur", "ville": "Sfax", "gouvernorat": "sfax", "code_postal": "3000"}'::jsonb, false,
  (select (r ->> 'total_millimes')::bigint from t_res where n = 1));
reset role;
select is((select livraison_gouvernorat || ' ' || frais_livraison_millimes from public.commandes where id = tests.id('commande_a')), 'sfax 9000', 'enregistré : l''adresse et les frais');
select ok(exists (select 1 from public.commande_evenements where commande_id = tests.id('commande_a') and commentaire like 'Adresse changée : 1 rue de Rome, Tunis% → 12 rue Habib Thameur, 3000 Sfax, Sfax'),
  'le journal garde l''ancienne adresse et la nouvelle');

select tests.connecte('confirm_a');
select is((select public.gestion_modifier_livraison(tests.id('A'), (select numero from t_ref), '{"ligne1": "x", "ville": "Kébili", "gouvernorat": "kebili"}'::jsonb, true) ->> 'ok'),
  'true', 'un gouvernorat hors de ses zones : le tarif fixe, comme à la vitrine');
select tests.connecte('prepa_a');
select throws_ok($$ select public.gestion_modifier_livraison(tests.id('A'), (select numero from t_ref), '{}'::jsonb, true) $$, '42501', null, 'la préparation ne change pas l''adresse');

select * from finish();
rollback;
