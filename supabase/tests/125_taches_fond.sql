-- =====================================================================
-- 125 · Les tâches de fond : chaque tour noté, la console le lit
-- =====================================================================
begin;
\ir outils.psql

select plan(12);

reset role;
delete from plateforme.taches_tours;
insert into plateforme.administrateurs (user_id, role) values (tests.cree_utilisateur('support_taches'), 'support');

-- 1. Un tour se note, avec ce qui reste dans la file.
insert into public.courriels_commandes (boutique_id, commande_id, evenement, etat, prochain_essai)
select tests.id('A'), c.id, 'annulee', 'a_envoyer', now() - interval '1 hour'
  from public.commandes c where c.boutique_id = tests.id('A') limit 1
on conflict do nothing;
select tests.service();
select lives_ok($$ select public.taches_noter('courriels', 'heure', now() - interval '2 seconds', true, 3, 1, null) $$, 'un tour des e-mails se note');
reset role;
select is((select faits || '/' || echecs from plateforme.taches_tours order by id desc limit 1), '3/1', 'ce qui est parti, ce qui a échoué');
select ok((select restants >= 1 from plateforme.taches_tours order by id desc limit 1), 'et ce qui reste dans la file, compté par la base');
select tests.service();
select throws_ok($$ select public.taches_noter('autre', 'heure', now(), true, 0, 0, null) $$, '23514', null, 'une tâche inconnue : refusée');
select lives_ok($$ select public.taches_noter('skanfact', 'console', now(), false, 0, 0, 'SkanFact ne répond pas') $$, 'un tour de SkanFact en échec se note aussi');

-- 2. Les boutiques dont un envoi à SkanFact est dû.
select is(public.taches_skanfact_dues(30), '{}'::uuid[], 'rien de dû à SkanFact au départ');

-- 3. La console : le dernier tour de chaque tâche, sa journée, sa file.
select is(jsonb_array_length(public.console_taches(tests.id('support_taches')) -> 'taches'), 2, 'le support lit les deux tâches');
select is((select x #>> '{dernier,faits}' from jsonb_array_elements(public.console_taches(tests.id('admin_plateforme')) -> 'taches') x where x ->> 'tache' = 'courriels'), '3',
  'le dernier tour des e-mails');
select ok((select (x ->> 'dus')::int >= 1 from jsonb_array_elements(public.console_taches(tests.id('admin_plateforme')) -> 'taches') x where x ->> 'tache' = 'courriels'),
  'et ce qui est dû maintenant');
select is((select x #>> '{dernier,detail}' from jsonb_array_elements(public.console_taches(tests.id('admin_plateforme')) -> 'taches') x where x ->> 'tache' = 'skanfact'),
  'SkanFact ne répond pas', 'l''échec de SkanFact, en clair');
select throws_ok(format($$ select public.console_tracer_taches(%L) $$, tests.id('support_taches')), '42501', null, 'le support ne lance pas un tour');

select tests.anonyme();
select throws_ok($$ select public.taches_noter('courriels', 'heure', now(), true, 0, 0, null) $$, '42501', null, 'un visiteur ne note rien');

select * from finish();
rollback;
