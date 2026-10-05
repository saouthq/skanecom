-- =====================================================================
-- 94 · La console, lot A : une boutique fermée n'achète plus rien
-- =====================================================================
begin;
\ir outils.psql

select plan(6);

reset role;
insert into plateforme.formules (code, nom, position) values ('ancienne', 'Ancienne offre', 99);
update plateforme.boutiques set formule = 'ancienne', statut = 'fermee' where id = tests.id('C');

select tests.service();
select is((select (f ->> 'boutiques')::int from jsonb_array_elements(public.console_formules(tests.id('admin_plateforme')) -> 'formules') f where f ->> 'code' = 'ancienne'),
  0, 'une boutique fermée ne compte plus parmi celles d''une formule');
select is((select b ->> 'statut' from jsonb_array_elements(public.console_formules(tests.id('admin_plateforme')) -> 'boutiques') b where (b ->> 'id')::uuid = tests.id('C')),
  'fermee', 'la console lit le statut de chaque boutique');

-- Une boutique en activité l'empêche toujours.
reset role;
update plateforme.boutiques set formule = 'ancienne' where id = tests.id('B');
select tests.service();
select throws_ok(format($$ select public.console_supprimer_formule(%L, 'ancienne') $$, tests.id('admin_plateforme')),
  '23514', null, 'une formule encore portée par une boutique ouverte ne se supprime pas');

reset role;
update plateforme.boutiques set formule = null where id = tests.id('B');
select tests.service();
select lives_ok(format($$ select public.console_supprimer_formule(%L, 'ancienne') $$, tests.id('admin_plateforme')),
  'portée seulement par une boutique fermée : elle se supprime');
reset role;
select is((select formule from plateforme.boutiques where id = tests.id('C')), null, 'la boutique fermée la quitte');
select is((select count(*)::int from plateforme.journal_audit where action = 'boutique.formule' and boutique_id = tests.id('C')), 1,
  'et le journal le dit');

select * from finish();
rollback;
