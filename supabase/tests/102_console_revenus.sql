-- =====================================================================
-- 102 · La console, lot E : les revenus de SkanEcom (le prix des
--       formules des boutiques clientes, ce que SkanFact a dit)
-- =====================================================================
begin;
\ir outils.psql

select plan(11);

select tests.service();
select throws_ok(format($$ select public.console_revenus(%L) $$, tests.id('proprio_a')),
  '42501', null, 'un propriétaire de boutique ne lit pas les revenus');
reset role;

-- (une base locale peut avoir des liens SkanFact : on part sans ; tout est défait à la fin)
delete from plateforme.facturation_liens;
update plateforme.formules set prix_mensuel_millimes = 49000 where code = 'essentiel';
update plateforme.formules set prix_mensuel_millimes = 99000 where code = 'pro';
update plateforme.formules set prix_mensuel_millimes = null where code = 'complete';
update plateforme.boutiques set formule = 'essentiel' where id = tests.id('A');
update plateforme.boutiques set formule = 'pro' where id = tests.id('C');
insert into plateforme.boutiques (id, slug, nom, statut, demonstration, formule)
values (tests.nouvel_id('demo_revenus'), 'demo-revenus', 'Démo revenus', 'active', true, 'essentiel'),
       (tests.nouvel_id('fermee_revenus'), 'fermee-revenus', 'Fermée revenus', 'fermee', false, 'essentiel');

-- Ce que SkanFact a dit (décimaux en texte, comme son API les rend).
insert into plateforme.facturation_liens (boutique_id, client, raison_sociale) values
  (tests.id('A'), gen_random_uuid(), 'Essai A SARL'), (tests.id('B'), gen_random_uuid(), 'Essai B SARL');
insert into plateforme.facturation_situations (boutique_id, situation) values
  (tests.id('A'), '{"soldes": [{"devise": "TND", "reste": "1073.190", "echu": "73.190", "facturesAPayer": 2, "facturesEchues": 1}],
                    "retard": {"depuis": "2026-09-01", "jours": 20, "numero": "F-12", "ecran": null}, "dernierReglement": null}'),
  (tests.id('B'), '{"soldes": [{"devise": "TND", "reste": "0.810", "echu": "0.000", "facturesAPayer": 1, "facturesEchues": 0}],
                    "retard": null, "dernierReglement": null}');

select tests.service();
create temp table r as select public.console_revenus(tests.id('admin_plateforme')) as j;
grant select on r to service_role;

select is((select f -> 'actives' from r, jsonb_array_elements(j -> 'formules') f where f ->> 'code' = 'essentiel'), '1'::jsonb,
  'Essentiel : une boutique ouverte (la démonstration et la fermée ne comptent pas)');
select is((select (f ->> 'suspendues')::int || ' ' || (f ->> 'prix') from r, jsonb_array_elements(j -> 'formules') f where f ->> 'code' = 'pro'),
  '1 99000', 'Pro : une suspendue, à 99 TND');
select ok((select f -> 'prix' = 'null'::jsonb from r, jsonb_array_elements(j -> 'formules') f where f ->> 'code' = 'complete'),
  'une formule sans prix le dit (prix nul)');
select is((select b ->> 'prix' from r, jsonb_array_elements(j -> 'boutiques') b where b ->> 'slug' = 'essai-a'), '49000', 'la boutique A, sa formule et son prix');
select ok((select b -> 'formule' = 'null'::jsonb from r, jsonb_array_elements(j -> 'boutiques') b where b ->> 'slug' = 'essai-b'), 'la boutique B, sans formule');
select is((select count(*)::int from r, jsonb_array_elements(j -> 'boutiques') b where b ->> 'slug' in ('demo-revenus', 'fermee-revenus')), 0,
  'ni la démonstration, ni la fermée');
select is((select b -> 'skanfact' ->> 'reste' from r, jsonb_array_elements(j -> 'boutiques') b where b ->> 'slug' = 'essai-a'), '1073.190',
  'le reste à payer de A, tel que SkanFact l''a dit');
select is((select j -> 'skanfact' ->> 'reste' from r), '1074.000', 'additionné exactement : 1073,190 + 0,810 = 1074,000');
select is((select (j -> 'skanfact' ->> 'echu') || ' ' || (j -> 'skanfact' ->> 'en_retard') from r), '73.190 1', 'l''échu, un client en retard');
select is((select (j -> 'skanfact' ->> 'reliees')::int from r), 2, 'deux boutiques reliées');

select * from finish();
rollback;
