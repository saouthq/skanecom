-- =====================================================================
-- 19 · L'export des données de la boutique
-- =====================================================================
begin;
\ir outils.psql

select plan(11);

reset role; select tests.connecte('confirm_a');
select throws_ok(format($$ select public.gestion_export(%L, 'clients') $$, tests.id('A')), '42501', null,
  'la confirmation n''exporte pas les clients');
reset role; select tests.connecte('proprio_b');
select throws_ok(format($$ select public.gestion_export(%L, 'commandes') $$, tests.id('A')), '42501', null,
  'le propriétaire de B n''exporte pas les données de A');

reset role; select tests.connecte('proprio_a');
select is(jsonb_array_length(public.gestion_export(tests.id('A'), 'commandes')), 2, 'les commandes de A, et elles seules');
select is(public.gestion_export(tests.id('A'), 'commandes') -> 0 ->> 'gouvernorat', 'Tunis', 'avec le nom du gouvernorat');
select is(jsonb_array_length(public.gestion_export(tests.id('A'), 'articles')), 2, 'les articles des commandes');
select is(jsonb_array_length(public.gestion_export(tests.id('A'), 'clients')), 3, 'les clients');
select is((select count(*)::int from jsonb_array_elements(public.gestion_export(tests.id('A'), 'catalogue')) x where x ->> 'reference' = 'VAL-55-NOIR'),
  1, 'le catalogue, une ligne par déclinaison');
select ok(jsonb_array_length(public.gestion_export(tests.id('A'), 'stock')) >= 1, 'le journal du stock');
select throws_ok(format($$ select public.gestion_export(%L, 'mots_de_passe') $$, tests.id('A')), '23514', null,
  'un export inconnu est refusé');

reset role;
select is((select apres from plateforme.journal_audit where boutique_id = tests.id('A') and action = 'export.clients' order by id desc limit 1),
  '{"lignes": 3}'::jsonb, 'chaque export passe au journal, avec son nombre de lignes');
select is((select acteur from plateforme.journal_audit where boutique_id = tests.id('A') and action = 'export.clients' order by id desc limit 1),
  tests.id('proprio_a'), 'et son auteur');

select * from finish();
rollback;
