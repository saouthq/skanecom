-- =====================================================================
-- 136 · La référence d'une erreur se retrouve : notée par le serveur,
--       ou à défaut signalée par le navigateur — jamais deux fois
-- =====================================================================
begin;
\ir outils.psql

select plan(5);

reset role;
delete from plateforme.erreurs;

-- Le navigateur seul (le serveur n'a pas pu noter) : une ligne, avec la référence.
select public.erreurs_noter('console', 'navigateur', null, null, null, '/etat', 'Erreur du serveur, signalée par le navigateur (référence 111)', null, '111');
select is((select count(*)::int from plateforme.erreurs where digest = '111'), 1, 'signalée par le navigateur seul : elle se retrouve par sa référence');

-- Le serveur note ensuite la même : sa note, avec le détail, remplace celle du navigateur.
select public.erreurs_noter('console', 'serveur', null, null, '/_console/(protegee)/etat/page', '/_console/etat', 'Lecture impossible : x', 'Error: x', '111');
select is((select string_agg(genre || ':' || message, ',') from plateforme.erreurs where digest = '111'), 'serveur:Lecture impossible : x',
  'le serveur note après : sa note remplace celle du navigateur');

-- Notée par le serveur d'abord : le signalement du navigateur ne compte pas deux fois.
select public.erreurs_noter('console', 'serveur', null, null, '/_console/(protegee)/annonces/page', '/_console/annonces', 'Annonces illisibles', 'Error: y', '222');
select public.erreurs_noter('console', 'navigateur', null, null, null, '/annonces', 'Erreur du serveur, signalée par le navigateur (référence 222)', null, '222');
select is((select count(*)::int from plateforme.erreurs where digest = '222'), 1, 'déjà notée par le serveur : le navigateur n''ajoute rien');
select is((select nombre from plateforme.erreurs where digest = '222'), 1, '… et elle ne compte pas deux fois');

-- Sans référence, rien ne change.
select public.erreurs_noter('console', 'navigateur', null, null, null, '/journal', 'TypeError: a is undefined', 'at b', null);
select is((select count(*)::int from plateforme.erreurs where message like 'TypeError%'), 1, 'une erreur du navigateur sans référence se note comme avant');

select * from finish();
rollback;
