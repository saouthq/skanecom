-- =====================================================================
-- 122 · Les erreurs de l'application : notées, regroupées, lues, réglées, en série
-- =====================================================================
begin;
\ir outils.psql

select plan(23);

reset role;
delete from plateforme.erreurs;
delete from plateforme.incidents;
insert into plateforme.domaines (hote, boutique_id, type, principal)
values ('erreur-a.essai.tn', tests.id('A'), 'personnalise', false)
on conflict (hote) do nothing;
insert into plateforme.administrateurs (user_id, role) values (tests.cree_utilisateur('support_erreurs'), 'support');

select tests.service();

-- 1. Noter : la boutique par l'adresse réécrite, ou par l'hôte.
select ok(public.erreurs_noter('vitrine', 'serveur', 'essai-a', null, '/_b/[boutique]/produit/[slug]', '/_b/essai-a/produit/valise?x=1',
  'Produit illisible : 5f0c9a1e-2b3d-4c5e-8f90-1a2b3c4d5e6f', 'Error: Produit illisible\n    at Page', 'abc123') is not null,
  'une erreur du serveur se note');
reset role;
select is((select boutique_id from plateforme.erreurs order by id desc limit 1), tests.id('A'), 'à sa boutique, par l''adresse réécrite (/_b/<boutique>/…)');
select is((select chemin from plateforme.erreurs order by id desc limit 1), '/_b/essai-a/produit/valise', 'le chemin, sans sa requête');
select tests.service();
select public.erreurs_noter('vitrine', 'serveur', null, 'Erreur-A.essai.tn:443', '/_b/[boutique]/produit/[slug]', '/produit/sac',
  'Produit illisible : 0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', null, 'def456');
reset role;
select is((select count(*)::int from plateforme.erreurs), 1,
  'la même erreur au même endroit (identifiant mis à part), par l''hôte cette fois : une seule ligne');
select is((select nombre from plateforme.erreurs), 2, 'qui compte ses fois');
select is((select digest from plateforme.erreurs), 'def456', 'et garde la dernière référence');
select tests.service();
select public.erreurs_noter('backoffice', 'navigateur', 'essai-a', null, null, '/gestion/essai-a/produits', 'Cannot read properties of undefined', null, null);
select public.erreurs_noter('console', 'serveur', null, null, '/_console/(protegee)/etat', '/etat', 'État technique illisible : délai dépassé', null, null);
reset role;
select is((select count(*)::int from plateforme.erreurs), 3, 'une autre surface, un autre message : d''autres lignes');
select is((select boutique_id from plateforme.erreurs where surface = 'console'), null, 'une erreur de la console n''a pas de boutique');
select tests.service();
select is(public.erreurs_noter('vitrine', 'serveur', 'essai-a', null, null, '/', '   ', null, null), null, 'un message vide ne se note pas');
select is(public.erreurs_noter('n''importe', 'serveur', null, null, null, '/x', 'Inconnue', null, null) is not null, true, 'une surface inconnue se range au serveur');
reset role;
select is((select surface from plateforme.erreurs where message = 'Inconnue'), 'serveur', '(surface « serveur »)');

-- 2. La console : lire, l'état pour « À surveiller ».
select tests.service();
select is((public.console_erreurs(tests.id('admin_plateforme')) ->> 'ouvertes')::int, 4, 'la console lit les erreurs ouvertes');
select is((public.console_erreurs(tests.id('admin_plateforme'), tests.id('A')) ->> 'ouvertes')::int, 2, 'celles d''une boutique');
select is((public.console_erreurs(tests.id('admin_plateforme'), tests.id('A')) #>> '{erreurs,0,boutique,slug}'), 'essai-a', 'chacune dit sa boutique');
select is((select (x ->> 'fois')::int from jsonb_array_elements(public.console_erreurs_etat(tests.id('admin_plateforme'))) x
            where x ->> 'boutique_id' = tests.id('A')::text), 3, '« À surveiller » : trois fois pour la boutique A ces 24 heures');
select throws_ok($$ select public.console_erreurs('00000000-0000-0000-0000-000000000000') $$, '42501', null, 'un inconnu ne les lit pas');

-- 3. Marquer réglées : le support le peut ; deux fois, non.
select is(public.console_regler_erreurs(tests.id('support_erreurs'), null, tests.id('A')), 2, 'le support marque réglées celles de la boutique A');
select throws_ok(format($$ select public.console_regler_erreurs(%L, null, %L) $$, tests.id('admin_plateforme'), tests.id('A')),
  '23514', null, 'déjà réglées : rien à marquer');
reset role;
select ok(exists (select 1 from plateforme.journal_audit where action = 'plateforme.erreurs_reglees'), 'le geste passe au journal');
select tests.service();
select public.erreurs_noter('vitrine', 'serveur', 'essai-a', null, '/_b/[boutique]/produit/[slug]', '/produit/sac', 'Produit illisible : 0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', null, null);
reset role;
select is((select count(*)::int from plateforme.erreurs where boutique_id = tests.id('A') and reglee_le is null), 1,
  'réglée, elle peut revenir : une nouvelle ligne');

-- 4. En série : dix fois en une heure, un incident à annoncer.
select tests.service();
select public.erreurs_noter('vitrine', 'serveur', 'essai-a', null, '/_b/[boutique]/produit/[slug]', '/produit/sac', 'Produit illisible : 0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', null, null)
  from generate_series(1, 9);
select ok(exists (select 1 from jsonb_array_elements(public.surveillance_incidents((public.surveillance_noter(null, 'heure', now(), '[]'::jsonb) ->> 'passage')::bigint) -> 'ouverts') x
                  where x ->> 'genre' = 'erreurs' and x #>> '{boutique,slug}' = 'essai-a'),
  'dix erreurs en une heure : un incident « erreurs » à annoncer, à sa boutique');
select public.console_regler_erreurs(tests.id('admin_plateforme'), null, tests.id('A'));
select public.surveillance_incidents((public.surveillance_noter(null, 'heure', now(), '[]'::jsonb) ->> 'passage')::bigint);
reset role;
select ok(not exists (select 1 from plateforme.incidents where genre = 'erreurs' and clos_le is null), 'réglées : l''incident se clôt au passage suivant');

select tests.anonyme();
select throws_ok($$ select public.erreurs_noter('vitrine', 'serveur', null, null, null, '/', 'x', null, null) $$, '42501', null,
  'personne d''autre ne note d''erreur');

select * from finish();
rollback;
