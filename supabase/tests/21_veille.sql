-- =====================================================================
-- 21 · La veille des nouvelles commandes
-- =====================================================================
begin;
\ir outils.psql

select plan(4);

reset role; select tests.anonyme();
select throws_ok(format($$ select public.gestion_veille(%L) $$, tests.id('A')), '42501', null, 'un visiteur ne veille pas');
reset role; select tests.connecte('proprio_b');
select throws_ok(format($$ select public.gestion_veille(%L) $$, tests.id('A')), '42501', null, 'ni une autre boutique');

reset role; select tests.connecte('prepa_a');
select is((public.gestion_veille(tests.id('A')) ->> 'a_confirmer')::int, 2, 'les deux commandes de A attendent l''appel');
select ok(public.gestion_veille(tests.id('A')) -> 'derniere' ->> 'numero' like 'MAY-%', 'et la dernière arrivée, avec son numéro');

select * from finish();
rollback;
