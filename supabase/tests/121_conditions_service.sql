-- =====================================================================
-- 121 · Les conditions de service : écrites, publiées, acceptées par le propriétaire
-- =====================================================================
begin;
\ir outils.psql

select plan(27);

reset role;
insert into plateforme.administrateurs (user_id, role) values (tests.cree_utilisateur('support_conditions'), 'support');

-- 0. Au départ : un brouillon, rien en vigueur, rien à demander.
select is((select count(*)::int from plateforme.conditions_service where publie_le is null), 1, 'la version 1 est posée en brouillon');
select tests.connecte('proprio_a');
select is(public.gestion_conditions_etat(tests.id('A')) -> 'a_accepter', 'false'::jsonb, 'rien en vigueur : rien n''est demandé au commerçant');

-- 1. La console : écrire, publier.
reset role; select tests.service();
select ok(jsonb_array_length(public.console_conditions(tests.id('admin_plateforme')) #> '{brouillon,a_completer}') >= 5,
  'le brouillon dit les champs à compléter (écrits entre crochets)');
select throws_ok(format($$ select public.console_publier_conditions(%L, 1) $$, tests.id('admin_plateforme')),
  '23514', null, 'publier un modèle encore à compléter : refusé');
select throws_ok(format($$ select public.console_enregistrer_conditions(%L, 'Titre', repeat('texte ', 60), null) $$, tests.id('support_conditions')),
  '42501', null, 'le rôle support lit les conditions, ne les écrit pas');
select is(public.console_enregistrer_conditions(tests.id('admin_plateforme'), 'Conditions de service de SkanEcom',
    'Ces conditions lient SkanEcom et le commerçant. ' || repeat('Chaque engagement est écrit ici en clair. ', 10), null), 1,
  'le super-administrateur complète le brouillon : toujours la version 1');
select is(public.console_publier_conditions(tests.id('admin_plateforme'), 1), 1, 'complété, il se publie');
select is((public.console_conditions(tests.id('admin_plateforme')) ->> 'en_vigueur')::int, 1, 'la version 1 est en vigueur');
reset role;
select throws_ok($$ update plateforme.conditions_service set texte = texte || ' (modifié)' where version = 1 $$,
  '23514', null, 'une version publiée ne se réécrit pas');
select ok(exists (select 1 from plateforme.journal_audit where action = 'plateforme.conditions_publiees'), 'la publication passe au journal');

-- 2. Le backoffice : le propriétaire, et lui seul.
select tests.connecte('proprio_a');
select is(public.gestion_conditions_etat(tests.id('A')) -> 'a_accepter', 'true'::jsonb, 'en vigueur : à accepter par la boutique');
select is(public.gestion_conditions_etat(tests.id('A')) -> 'peut_accepter', 'true'::jsonb, 'le propriétaire peut accepter');
select is(public.gestion_conditions(tests.id('A')) #>> '{conditions,version}', '1', 'il lit le texte en vigueur');
reset role; select tests.connecte('lecture_a');
select is(public.gestion_conditions_etat(tests.id('A')) -> 'peut_accepter', 'false'::jsonb, 'un membre en lecture ne le peut pas');
select throws_ok(format($$ select public.gestion_accepter_conditions(%L, 1) $$, tests.id('A')),
  '42501', null, 'un membre en lecture n''accepte pas au nom de l''entreprise');
reset role; select tests.connecte('proprio_b');
select throws_ok(format($$ select public.gestion_conditions(%L) $$, tests.id('A')),
  '42501', null, 'le propriétaire d''une autre boutique ne lit pas celles de A');
reset role; select tests.connecte('proprio_a');
select throws_ok(format($$ select public.gestion_accepter_conditions(%L, 2) $$, tests.id('A')),
  '23514', null, 'une version qui n''est pas en vigueur : refusée');
select is(public.gestion_accepter_conditions(tests.id('A'), 1) -> 'a_accepter', 'false'::jsonb, 'acceptées : plus rien à demander');
select is(public.gestion_accepter_conditions(tests.id('A'), 1) -> 'a_accepter', 'false'::jsonb, 'accepter deux fois ne double rien');
reset role;
select is((select count(*)::int from plateforme.conditions_acceptations where boutique_id = tests.id('A')), 1, 'un accord, une ligne');
select ok((select qui like '%@%' and au_nom_de <> '' from plateforme.conditions_acceptations where boutique_id = tests.id('A')),
  'l''accord garde qui (son e-mail) et au nom de quelle entreprise');
select ok(exists (select 1 from plateforme.journal_audit where action = 'boutique.conditions_acceptees' and boutique_id = tests.id('A')),
  'l''accord passe au journal de la boutique');

-- 3. La mise en place : une onzième étape, faite pour A.
select is(jsonb_array_length(public.console_mise_en_place(tests.id('A')) -> 'etapes'), 11, 'la mise en place compte onze étapes');
select is((select (e ->> 'fait')::boolean from jsonb_array_elements(public.console_mise_en_place(tests.id('A')) -> 'etapes') e where e ->> 'cle' = 'conditions'),
  true, 'l''étape « conditions » est faite pour A');

-- 4. Une nouvelle version : dire ce qui change, puis la boutique accepte de nouveau.
select tests.service();
select public.console_enregistrer_conditions(tests.id('admin_plateforme'), 'Conditions de service de SkanEcom',
  'Ces conditions lient SkanEcom et le commerçant. ' || repeat('Chaque engagement est écrit ici en clair, version deux. ', 10), null);
select throws_ok(format($$ select public.console_publier_conditions(%L, 2) $$, tests.id('admin_plateforme')),
  '23514', null, 'une version 2 sans dire ce qui change : refusée');
select public.console_enregistrer_conditions(tests.id('admin_plateforme'), 'Conditions de service de SkanEcom',
  'Ces conditions lient SkanEcom et le commerçant. ' || repeat('Chaque engagement est écrit ici en clair, version deux. ', 10),
  'Le délai d''effacement passe à trente jours.');
select public.console_publier_conditions(tests.id('admin_plateforme'), 2);
reset role; select tests.connecte('proprio_a');
select is(public.gestion_conditions_etat(tests.id('A')) -> 'a_accepter', 'true'::jsonb, 'la version 2 publiée : à accepter de nouveau');

reset role; select tests.anonyme();
select throws_ok(format($$ select public.gestion_conditions_etat(%L) $$, tests.id('A')), '42501', null, 'un visiteur n''y touche pas');

select * from finish();
rollback;
