-- =====================================================================
-- 137 · La coquille du backoffice en une lecture : les mêmes états que
--       les seize appels d'avant, et rien pour qui n'est pas de l'équipe
-- =====================================================================
begin;
\ir outils.psql

select plan(4);

reset role; select tests.connecte('lecture_a');
select ok((select public.gestion_coquille(tests.id('A'))) ?& array['gestion_sav_etat', 'gestion_avis_etat', 'gestion_conditions_etat', 'maintenance_etat'],
  'un membre : chaque état de la navigation, sous son nom');
select is((select public.gestion_coquille(tests.id('A')) -> 'gestion_sav_etat'), (select public.gestion_sav_etat(tests.id('A'))),
  'le même état que l''appel séparé (le SAV)');
select ok(not ((select public.gestion_coquille(tests.id('A'))) ? 'gestion_suspension'), 'pas suspendue : la suspension n''est pas lue');

-- Qui n'est pas de l'équipe d'une boutique : rien de ses états (chacun refuse, la coquille rend null).
select is((select public.gestion_coquille(tests.id('B')) -> 'gestion_sav_etat'), 'null'::jsonb,
  'une autre boutique : ses états restent fermés');

select * from finish();
rollback;
