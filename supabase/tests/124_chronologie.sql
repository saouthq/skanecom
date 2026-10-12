-- =====================================================================
-- 124 · La chronologie : les mises en ligne, et le fil de ce qui a changé
-- =====================================================================
begin;
\ir outils.psql

select plan(21);

reset role;
delete from plateforme.mises_en_ligne;
delete from plateforme.incidents;
delete from plateforme.erreurs;
delete from plateforme.journal_audit;
insert into plateforme.administrateurs (user_id, role) values (tests.cree_utilisateur('support_chrono'), 'support');

-- 1. La version en ligne se note : une ligne par mise en ligne.
select tests.service();
select is(public.versions_noter('aaa1111', 'Première version', now() - interval '2 hours', '20260929120600'), true, 'une première version se note');
select is(public.versions_noter('aaa1111', 'Première version', now() - interval '2 hours', '20260929120600'), false, 'revue : pas de nouvelle ligne');
reset role;
select is((select count(*)::int from plateforme.mises_en_ligne), 1, 'une seule ligne');
-- (l'heure de la première ligne recule, pour la suite : une mise en ligne d'il y a une heure)
update plateforme.mises_en_ligne set vue_le = now() - interval '1 hour';
select tests.service();
select is(public.versions_noter('bbb2222', 'Deuxième version', now() - interval '10 minutes', '20260929120700'), true, 'une nouvelle version : une nouvelle ligne');
-- Pendant le déploiement, l'ancienne répond encore : pas un retour arrière.
select is(public.versions_noter('aaa1111', 'Première version', now() - interval '2 hours', '20260929120600'), false,
  'l''ancienne version, revue dans le quart d''heure : pas un retour arrière');
reset role;
update plateforme.mises_en_ligne set vue_le = now() - interval '30 minutes' where version = 'bbb2222';
select tests.service();
select is(public.versions_noter('aaa1111', 'Première version', now() - interval '2 hours', '20260929120600'), true,
  'plus tard, la même ancienne version : un retour arrière, noté');
select is(public.versions_noter('  ', null, null, null), false, 'sans version : rien');
select throws_ok($$ select public.console_chronologie('00000000-0000-0000-0000-000000000000', 7, null) $$, '42501', null, 'un inconnu ne lit pas la chronologie');
reset role;
select tests.anonyme();
select throws_ok($$ select public.versions_noter('ccc', null, null, null) $$, '42501', null, 'un visiteur ne note pas de version');
reset role;

-- 2. Le fil : versions, changements, pannes, erreurs.
insert into plateforme.journal_audit (at, acteur, boutique_id, action, cible) values
  (now() - interval '25 minutes', tests.id('admin_plateforme'), tests.id('A'), 'module.couper', 'avis'),
  (now() - interval '24 minutes', tests.id('admin_plateforme'), tests.id('A'), 'note.ajouter', null),   -- la vie courante : pas au fil
  (now() - interval '23 minutes', tests.id('admin_plateforme'), tests.id('B'), 'apparence.publier', null),
  (now() - interval '22 minutes', tests.id('admin_plateforme'), null, 'plateforme.alertes', null);
insert into plateforme.incidents (cle, genre, boutique_id, cible, detail, ouvert_le, clos_le)
values ('page:a:x', 'page', tests.id('A'), 'essai-a.localhost', 'HTTP 500', now() - interval '20 minutes', now() - interval '5 minutes');
insert into plateforme.erreurs (empreinte, surface, genre, boutique_id, message, premiere_le)
values ('e1', 'vitrine', 'serveur', tests.id('A'), 'Produit illisible', now() - interval '15 minutes');

select tests.service();
create temp table c as select public.console_chronologie(tests.id('support_chrono'), 1, null) as j;
select is((select jsonb_array_length(j -> 'fil') from c), 9,
  'le support lit le fil de 24 heures : 3 mises en ligne, 3 changements, une panne et son retour, une erreur');
select ok((select not exists (select 1 from jsonb_array_elements(j -> 'fil') x where x ->> 'action' = 'note.ajouter') from c),
  'une note de suivi n''est pas un changement');
select is((select j #>> '{fil,0,genre}' from c), 'version', 'le plus récent d''abord : le retour à la première version');
select is((select (j #>> '{fil,0,retour}')::boolean from c), true, '(dit « retour arrière »)');
select is((select count(*)::int from c, jsonb_array_elements(j -> 'fil') x where x ->> 'genre' in ('panne', 'retabli')), 2, 'la panne, puis son retour');
select is((select x #>> '{boutique,slug}' from c, jsonb_array_elements(j -> 'fil') x where x ->> 'genre' = 'erreur'), 'essai-a', 'l''erreur dit sa boutique');
select is((select jsonb_array_length(j -> 'versions') from c), 3, 'les dernières mises en ligne');
select is((select j #>> '{versions,0,version}' from c), 'aaa1111', 'la plus récente d''abord');

-- 3. Pour une boutique : les siens, et ce qui touche toute la plateforme.
drop table c;
create temp table c as select public.console_chronologie(tests.id('admin_plateforme'), 1, tests.id('A')) as j;
select ok((select not exists (select 1 from jsonb_array_elements(j -> 'fil') x where x ->> 'action' = 'apparence.publier') from c),
  'pour la boutique A : la publication de la boutique B n''y est pas');
select ok((select exists (select 1 from jsonb_array_elements(j -> 'fil') x where x ->> 'action' = 'plateforme.alertes') from c),
  'un réglage de toute la plateforme, si');
select is((select count(*)::int from c, jsonb_array_elements(j -> 'fil') x where x ->> 'genre' = 'version'), 3, 'les mises en ligne aussi');

-- 4. La période : bornée de 1 à 30 jours.
select is((public.console_chronologie(tests.id('admin_plateforme'), 365, null) ->> 'jours')::int, 30, 'au plus 30 jours');

select * from finish();
rollback;
