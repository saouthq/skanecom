-- =====================================================================
-- 114 · Le studio photo : un module coupé par défaut, ouvert par la console
-- =====================================================================
begin;
\ir outils.psql

select plan(7);

reset role;
select ok(exists (select 1 from plateforme.modules where code = 'studio_photo' and disponible),
  'le module existe et la console peut l''activer');
select ok(exists (select 1 from plateforme.droits where code = 'module.studio_photo' and genre = 'module'),
  'les formules peuvent l''ouvrir');
select ok(exists (select 1 from plateforme.formule_droits where formule = 'complete' and droit = 'module.studio_photo'),
  'la formule complète l''ouvre');

select tests.connecte('proprio_a');
select is(public.gestion_studio_etat(tests.id('A')) ->> 'actif', 'false', 'coupé par défaut : pas de bouton « studio »');

reset role;
insert into plateforme.modules_actifs (boutique_id, module) values (tests.id('A'), 'studio_photo');
select tests.connecte('lecture_a');
select is(public.gestion_studio_etat(tests.id('A')) ->> 'actif', 'true', 'activé : toute l''équipe le voit');

reset role; select tests.connecte('proprio_b');
select throws_ok(format($$ select public.gestion_studio_etat(%L) $$, tests.id('A')), '42501', null,
  'une autre boutique ne lit rien');

reset role;
select ok(not has_function_privilege('anon', 'public.gestion_studio_etat(uuid)', 'execute')
          and not has_function_privilege('authenticated', 'private.studio_actif(uuid)', 'execute'),
  'rien pour un visiteur ; le test du module reste interne');

select * from finish();
rollback;
