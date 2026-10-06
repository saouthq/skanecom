-- =====================================================================
-- 116 · La rédaction des descriptions : un module coupé par défaut, ouvert par la console
-- =====================================================================
begin;
\ir outils.psql

select plan(7);

reset role;
select ok(exists (select 1 from plateforme.modules where code = 'redaction' and disponible),
  'le module existe et la console peut l''activer');
select ok(exists (select 1 from plateforme.droits where code = 'module.redaction' and genre = 'module'),
  'les formules peuvent l''ouvrir');
select ok(exists (select 1 from plateforme.formule_droits where formule = 'complete' and droit = 'module.redaction'),
  'la formule complète l''ouvre');

select tests.connecte('proprio_a');
select is(public.gestion_redaction_etat(tests.id('A')) ->> 'actif', 'false', 'coupé par défaut : pas de bouton « Rédiger la description »');

reset role;
insert into plateforme.modules_actifs (boutique_id, module) values (tests.id('A'), 'redaction');
select tests.connecte('lecture_a');
select is(public.gestion_redaction_etat(tests.id('A')) ->> 'actif', 'true', 'activé : toute l''équipe le lit (le geste reste à ceux qui modifient la fiche)');

reset role; select tests.connecte('proprio_b');
select throws_ok(format($$ select public.gestion_redaction_etat(%L) $$, tests.id('A')), '42501', null,
  'une autre boutique ne lit rien');

reset role;
select ok(not has_function_privilege('anon', 'public.gestion_redaction_etat(uuid)', 'execute')
          and not has_function_privilege('authenticated', 'private.redaction_active(uuid)', 'execute'),
  'rien pour un visiteur ; le test du module reste interne');

select * from finish();
rollback;
