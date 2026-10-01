-- =====================================================================
-- 80 · L'abonnement d'une boutique, un contrat dans SkanFact
-- =====================================================================
begin;
\ir outils.psql

select plan(11);

reset role; select tests.service();
create temp table c (client uuid, contrat uuid);
insert into c values ('00000000-0000-4000-8888-000000000001', '00000000-0000-4000-8888-0000000000c1');
select throws_like(format($$ select public.console_garder_contrat(%L, %L, gen_random_uuid(), 'X') $$, tests.id('admin_plateforme'), tests.id('A')),
  '%aucun client SkanFact%', 'une boutique sans client SkanFact n''a pas d''abonnement');
select public.console_lier_skanfact(tests.id('admin_plateforme'), tests.id('A'), (select client from c), 'Menuiserie du Lac', null);
select throws_ok(format($$ select public.console_garder_contrat(%L, %L, gen_random_uuid(), 'X') $$, tests.id('proprio_a'), tests.id('A')),
  '42501', null, 'seul un administrateur de la plateforme le garde');

select public.console_garder_contrat(tests.id('admin_plateforme'), tests.id('A'), (select contrat from c), 'Abonnement — {mois}');
select is((public.console_facturation(tests.id('A')) -> 'lien' ->> 'contrat')::uuid, (select contrat from c), 'le contrat est gardé avec le lien');
select is((select cible from plateforme.journal_audit where boutique_id = tests.id('A') and action = 'facturation.abonnement'),
  'Abonnement — {mois}', 'tracé, avec son objet');
select public.console_garder_contrat(tests.id('admin_plateforme'), tests.id('A'), (select contrat from c), 'Abonnement — {mois}');
select is((select count(*)::int from plateforme.journal_audit where boutique_id = tests.id('A') and action = 'facturation.abonnement'), 1,
  'le même contrat ne refait rien');

select public.console_noter_abonnement(tests.id('admin_plateforme'), tests.id('A'), 'suspendu', 'Abonnement — {mois}');
select is((select count(*)::int from plateforme.journal_audit where boutique_id = tests.id('A') and action = 'facturation.abonnement_suspendu'), 1,
  'suspendre dans SkanFact est noté au journal');
select throws_like(format($$ select public.console_noter_abonnement(%L, %L, 'efface', null) $$, tests.id('admin_plateforme'), tests.id('A')),
  '%Geste inconnu%', 'un autre geste est refusé');

select public.console_garder_contrat(tests.id('admin_plateforme'), tests.id('A'), null, null);
select throws_like(format($$ select public.console_noter_abonnement(%L, %L, 'repris', null) $$, tests.id('admin_plateforme'), tests.id('A')),
  '%pas d''abonnement suivi%', 'sans abonnement suivi, rien à noter');
select is(public.console_facturation(tests.id('A')) -> 'lien' -> 'contrat', 'null'::jsonb, 'oublié');
select is((select count(*)::int from plateforme.journal_audit where boutique_id = tests.id('A') and action = 'facturation.abonnement_oublie'), 1, 'et tracé');

-- Un autre client : l'abonnement de l'ancien ne vaut plus.
select public.console_garder_contrat(tests.id('admin_plateforme'), tests.id('A'), (select contrat from c), 'Abonnement');
select public.console_lier_skanfact(tests.id('admin_plateforme'), tests.id('A'), gen_random_uuid(), 'Autre client', null);
select is(public.console_facturation(tests.id('A')) -> 'lien' -> 'contrat', 'null'::jsonb, 'changer de client oublie l''abonnement de l''ancien');

select * from finish();
rollback;
