-- =====================================================================
-- 126 · Le diagnostic d'une boutique : tout ce qui fait qu'elle vend, d'un coup
-- =====================================================================
begin;
\ir outils.psql

select plan(9);

reset role;
insert into plateforme.administrateurs (user_id, role) values (tests.cree_utilisateur('support_diag'), 'support');
select tests.service();
create temp table d as select public.console_diagnostic(tests.id('support_diag'), tests.id('A')) as j;
select is((select j #>> '{boutique,slug}' from d), 'essai-a', 'le support lit le diagnostic d''une boutique');
select ok((select j ? 'domaine' and j ? 'courriels' and j ? 'catalogue' and j ? 'livraison' and j ? 'paiement' and j ? 'commandes' from d), 'chaque point y est');
select ok((select (j #>> '{catalogue,publies}')::int >= (j #>> '{catalogue,en_stock}')::int from d), 'le catalogue : publiés, et en stock');
select is((select j -> 'maintenance' from d), 'null'::jsonb, 'pas en maintenance');
select is((select (j ->> 'maintenance_plateforme')::boolean from d), false, 'la plateforme non plus');
reset role;
insert into plateforme.maintenances (boutique_id, message) values (tests.id('A'), 'Inventaire');
select tests.service();
select is(public.console_diagnostic(tests.id('admin_plateforme'), tests.id('A')) #>> '{maintenance,message}', 'Inventaire', 'en maintenance : le diagnostic le dit, avec son mot');
select throws_ok(format($$ select public.console_diagnostic(%L, %L) $$, tests.id('admin_plateforme'), gen_random_uuid()), 'P0002', null, 'une boutique inconnue');
select throws_ok(format($$ select public.console_diagnostic('00000000-0000-0000-0000-000000000000', %L) $$, tests.id('A')), '42501', null, 'un inconnu ne lit rien');
select tests.anonyme();
select throws_ok(format($$ select public.console_diagnostic(%L, %L) $$, tests.id('admin_plateforme'), tests.id('A')), '42501', null, 'un visiteur non plus');

select * from finish();
rollback;
