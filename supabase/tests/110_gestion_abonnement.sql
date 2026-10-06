-- =====================================================================
-- 110 · L'abonnement lu par le commerçant : sa formule, ses factures
--       SkanEcom à payer (la copie gardée de SkanFact), ses envois du mois
-- =====================================================================
begin;
\ir outils.psql

select plan(13);

delete from plateforme.droits_boutique;
update plateforme.formules set prix_mensuel_millimes = 49000 where code = 'essentiel';
update plateforme.boutiques set formule = 'essentiel', prix_mensuel_millimes = null where id = tests.id('A');
update plateforme.boutiques set formule = null, prix_mensuel_millimes = null where id = tests.id('B');

-- L'équipe : la direction lit, le reste non ; une autre boutique non plus.
select tests.connecte('prepa_a');
select throws_ok(format($$ select public.gestion_abonnement(%L) $$, tests.id('A')), '42501', null,
  'la préparation ne lit pas l''abonnement');
select tests.connecte('proprio_b');
select throws_ok(format($$ select public.gestion_abonnement(%L) $$, tests.id('A')), '42501', null,
  'le propriétaire d''une autre boutique non plus');
select tests.anonyme();
select throws_ok(format($$ select public.gestion_abonnement(%L) $$, tests.id('A')), '42501', null,
  'un visiteur non plus');

select tests.connecte('lecture_a');
select is(public.gestion_abonnement(tests.id('A')) #>> '{formule,nom}', 'Essentiel', 'la lecture voit sa formule');
select tests.connecte('proprio_a');
select is((public.gestion_abonnement(tests.id('A')) ->> 'prix')::int, 49000, 'son prix : celui de la formule');
select ok((select bool_and(not (x ->> 'ouvert')::boolean and x ->> 'requise' is not null)
             from jsonb_array_elements(public.gestion_abonnement(tests.id('A')) -> 'droits') x
            where x ->> 'code' = 'module.sav'), 'le SAV, hors Essentiel : la formule qui l''ouvre est dite');
select is(public.gestion_abonnement(tests.id('A')) -> 'facturation', 'null'::jsonb, 'pas encore reliée à SkanFact : rien à payer à lire');

-- Un prix propre l'emporte ; sur mesure, tout est ouvert.
reset role;
update plateforme.boutiques set prix_mensuel_millimes = 59000 where id = tests.id('A');
select tests.connecte('proprio_a');
select is((public.gestion_abonnement(tests.id('A')) ->> 'prix')::int, 59000, 'un prix propre l''emporte sur celui de la formule');
select tests.connecte('proprio_b');
select ok((select bool_and((x ->> 'ouvert')::boolean) from jsonb_array_elements(public.gestion_abonnement(tests.id('B')) -> 'droits') x)
          and public.gestion_abonnement(tests.id('B')) -> 'formule' = 'null'::jsonb, 'sur mesure : tout est ouvert');

-- Reliée : la dernière lecture de SkanFact, sans le lien vers son écran.
reset role;
insert into plateforme.facturation_liens (boutique_id, client, raison_sociale, identifiant)
values (tests.id('A'), gen_random_uuid(), 'Essai A SARL', '1234567A');
insert into plateforme.facturation_situations (boutique_id, situation, factures) values (tests.id('A'),
  '{"soldes": [{"devise": "TND", "reste": "59.000", "echu": "59.000", "facturesAPayer": 1, "facturesEchues": 1}],
    "retard": {"depuis": "2026-09-05", "jours": 31, "numero": "F-2026-0042", "ecran": "https://skanfact.example/ventes/1"},
    "dernierReglement": null}',
  '[{"id": "f1", "numero": "F-2026-0042", "datePiece": "2026-09-01", "echeance": "2026-09-05", "devise": "TND", "symbole": "DT",
     "netAPayer": "59.000", "reste": "59.000", "clientId": "c1", "client": "Essai A SARL", "objet": "Abonnement septembre", "ecran": "https://skanfact.example/ventes/1"}]');
select tests.connecte('proprio_a');
select is(public.gestion_abonnement(tests.id('A')) #>> '{facturation,factures,0,numero}', 'F-2026-0042', 'ses factures à payer, lues');
select ok(position('skanfact.example' in public.gestion_abonnement(tests.id('A'))::text) = 0,
  'aucun lien vers l''écran de SkanFact (l''entreprise SkanEcom y est seule)');
select is((public.gestion_abonnement(tests.id('A')) #>> '{facturation,retard,jours}')::int, 31, 'le retard est dit');

-- Ses envois du mois, face à ce qui est compris.
reset role;
update plateforme.formules set quota_sms_mois = 100 where code = 'essentiel';
insert into plateforme.consommations (boutique_id, mois, canal, nature, envoyes)
values (tests.id('A'), private.mois_tunis(now()), 'sms', 'code', 12);
select tests.connecte('proprio_a');
select is(public.gestion_abonnement(tests.id('A')) #> '{envois,sms}', '{"envoyes": 12, "quota": 100}'::jsonb, 'ses SMS du mois, sur ce qui est compris');

select * from finish();
rollback;
