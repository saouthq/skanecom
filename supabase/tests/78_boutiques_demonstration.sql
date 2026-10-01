-- =====================================================================
-- 78 · Les boutiques de démonstration
-- =====================================================================
begin;
\ir outils.psql

select plan(10);

select is((select demonstration from plateforme.boutiques where id = tests.id('A')), false, 'une boutique est une cliente, par défaut');

-- Portes
reset role; select tests.anonyme();
select throws_ok(format($$ select public.console_marquer_demonstration(%L, %L, true) $$, tests.id('proprio_a'), tests.id('A')),
  '42501', null, 'un visiteur ne marque rien');
reset role; select tests.connecte('proprio_a');
select throws_ok(format($$ select public.console_marquer_demonstration(%L, %L, true) $$, tests.id('proprio_a'), tests.id('A')),
  '42501', null, 'le propriétaire ne marque pas sa boutique');
reset role; select tests.service();
select throws_ok(format($$ select public.console_marquer_demonstration(%L, %L, true) $$, tests.id('proprio_a'), tests.id('A')),
  '42501', null, 'la base refuse un acteur qui n''est pas administrateur de la plateforme');
select throws_ok(format($$ select public.console_marquer_demonstration(%L, gen_random_uuid(), true) $$, tests.id('admin_plateforme')),
  'P0002', null, 'une boutique inconnue est refusée');

-- Marquer, tracer, défaire
select public.console_marquer_demonstration(tests.id('admin_plateforme'), tests.id('A'), true);
select public.console_marquer_demonstration(tests.id('admin_plateforme'), tests.id('A'), true);
select is((select demonstration from plateforme.boutiques where id = tests.id('A')), true, 'marquée de démonstration');
select results_eq($$ select action, avant, apres from plateforme.journal_audit where boutique_id = tests.id('A') and action = 'boutique.demonstration' $$,
  $$ values ('boutique.demonstration'::text, '{"demonstration": false}'::jsonb, '{"demonstration": true}'::jsonb) $$,
  'le geste est tracé une fois (le second, sans effet, ne l''est pas)');
select is((select x ->> 'demonstration' from jsonb_array_elements(public.console_pilotage()) x where x ->> 'id' = tests.id('A')::text), 'true',
  'le poste de pilotage le dit');
select is(public.console_boutique('essai-a') -> 'boutique' ->> 'demonstration', 'true', 'la fiche de la boutique aussi');
select public.console_marquer_demonstration(tests.id('admin_plateforme'), tests.id('A'), false);
select is((select demonstration from plateforme.boutiques where id = tests.id('A')), false, 'de nouveau cliente');

select * from finish();
rollback;
