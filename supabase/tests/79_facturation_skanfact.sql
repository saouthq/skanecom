-- =====================================================================
-- 79 · La facturation des clients, lue dans SkanFact (cadrage 06)
-- =====================================================================
begin;
\ir outils.psql

select plan(19);

-- Portes
reset role; select tests.anonyme();
select throws_ok(format($$ select public.console_facturation(%L) $$, tests.id('A')), '42501', null, 'un visiteur ne lit rien');
reset role; select tests.connecte('proprio_a');
select throws_ok(format($$ select public.console_lier_skanfact(%L, %L, gen_random_uuid(), 'X', null) $$, tests.id('proprio_a'), tests.id('A')),
  '42501', null, 'le propriétaire ne relie pas sa boutique');
select throws_ok($$ select * from plateforme.facturation_liens $$, '42501', null, 'ni ne lit les liens');
reset role; select tests.service();
select throws_ok(format($$ select public.console_lier_skanfact(%L, %L, gen_random_uuid(), 'X', null) $$, tests.id('proprio_a'), tests.id('A')),
  '42501', null, 'la base refuse un acteur qui n''est pas administrateur de la plateforme');

-- Relier
create temp table c (client uuid);
insert into c values ('00000000-0000-4000-8888-000000000001');
select public.console_lier_skanfact(tests.id('admin_plateforme'), tests.id('A'), (select client from c), ' Menuiserie du Lac ', ' 1234567A/M/000 ');
select results_eq($$ select client, raison_sociale, identifiant from plateforme.facturation_liens where boutique_id = tests.id('A') $$,
  $$ select (select client from c), 'Menuiserie du Lac'::text, '1234567A/M/000'::text $$, 'la boutique est reliée à son client SkanFact (espaces ôtés)');
select is((select count(*)::int from plateforme.journal_audit where boutique_id = tests.id('A') and action = 'facturation.lier'), 1, 'le lien est tracé');
select public.console_lier_skanfact(tests.id('admin_plateforme'), tests.id('A'), (select client from c), 'Menuiserie du Lac', null);
select is((select count(*)::int from plateforme.journal_audit where boutique_id = tests.id('A') and action = 'facturation.lier'), 1,
  'relier au même client ne refait rien (ni trace)');

-- Une démonstration n'a pas de client à facturer
update plateforme.boutiques set demonstration = true where id = tests.id('B');
select throws_like(format($$ select public.console_lier_skanfact(%L, %L, gen_random_uuid(), 'X', null) $$, tests.id('admin_plateforme'), tests.id('B')),
  '%démonstration%', 'une boutique de démonstration ne se relie pas');

-- Garder la situation lue
select ok(public.console_garder_situation(tests.id('A'), (select client from c),
  '{"au": "2026-10-01", "soldes": [{"devise": "TND", "reste": "773.190", "echu": "773.190", "facturesAPayer": 1, "facturesEchues": 1}], "retard": {"jours": 16}}',
  '[{"numero": "FAC-2026-003", "echeance": "2026-10-15", "reste": "119.000"}, {"numero": "FAC-2026-001", "echeance": "2026-09-15", "reste": "773.190"}]'),
  'la situation lue est gardée');
select is(public.console_facturation(tests.id('A')) -> 'situation' -> 'retard' ->> 'jours', '16', 'telle que SkanFact l''a dite');
select is((select x -> 'facturation' -> 'situation' -> 'retard' ->> 'jours' from jsonb_array_elements(public.console_pilotage()) x
            where x ->> 'id' = tests.id('A')::text), '16', 'le poste de pilotage la lit, sans appeler SkanFact');
select is((select x -> 'facturation' ->> 'echeance' || ' ' || (x -> 'facturation' ->> 'numero') from jsonb_array_elements(public.console_pilotage()) x
            where x ->> 'id' = tests.id('A')::text), '2026-09-15 FAC-2026-001', 'avec la plus ancienne échéance encore à payer, et sa facture');
select ok(not public.console_garder_situation(tests.id('A'), gen_random_uuid(), '{}', '[]'),
  'la situation d''un autre client n''est pas gardée');

-- Changer de client efface la situation de l'ancien ; délier efface tout.
select public.console_lier_skanfact(tests.id('admin_plateforme'), tests.id('A'), gen_random_uuid(), 'Autre client', null);
select is(public.console_facturation(tests.id('A')) -> 'situation', 'null'::jsonb, 'un autre client : l''ancienne situation ne vaut plus');
select public.console_delier_skanfact(tests.id('admin_plateforme'), tests.id('A'));
select is(public.console_facturation(tests.id('A')) -> 'lien', 'null'::jsonb, 'déliée');

-- Les avis : une fois chacun
select ok(public.console_avis_skanfact('avis-1', 'facture.reglee'), 'un avis nouveau est reçu');
select ok(not public.console_avis_skanfact('avis-1', 'facture.reglee'), 'rejoué, il n''agit pas deux fois');

select is(public.console_facturation(tests.id('A')) -> 'dernier_avis' ->> 'evenement', 'facture.reglee', 'le dernier avis reçu se lit');

-- Le matricule que la boutique a déclaré (ses mentions légales) aide à retrouver son client.
reset role;
insert into public.reglages (boutique_id, cle, valeur) values (tests.id('A'), 'legal.matricule_fiscal', to_jsonb(' 1234567A/M/000 '::text))
on conflict (boutique_id, cle) do update set valeur = excluded.valeur;
select tests.service();
select is(public.console_facturation(tests.id('A')) ->> 'matricule', '1234567A/M/000', 'le matricule déclaré par la boutique se lit');

select * from finish();
rollback;
