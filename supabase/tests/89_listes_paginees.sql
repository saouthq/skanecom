-- =====================================================================
-- 89 · Les listes paginées : la lettre et les avis, page par page
-- =====================================================================
begin;
\ir outils.psql

select plan(6);

-- Soixante-deux inscrites à la lettre de A.
reset role;
insert into public.lettre_abonnes (boutique_id, email, statut, consentement, page, inscrit_le)
select tests.id('A'), format('abonnee%s@exemple.tn', lpad(n::text, 2, '0')), 'inscrit',
       'J''accepte de recevoir la lettre de A.', '/', now() - make_interval(hours => n)
  from generate_series(1, 62) n;

select tests.connecte('proprio_a');
select is(jsonb_array_length(public.gestion_lettre(tests.id('A')) -> 'abonnes'), 50,
  'la première page : cinquante inscrites');
select results_eq($$ select jsonb_array_length(x -> 'abonnes'), (x ->> 'trouves')::int, x #>> '{abonnes,0,email}'
                     from (select public.gestion_lettre(tests.id('A'), null, 50) as x) t $$,
  $$ values (12, 62, 'abonnee51@exemple.tn'::text) $$,
  'la deuxième : les douze suivantes, dans l''ordre, sur soixante-deux');
select is(jsonb_array_length(public.gestion_lettre(tests.id('A'), 'abonnee0', 0) -> 'abonnes'), 9,
  'la recherche se pagine aussi (abonnee01 à abonnee09)');
select is(jsonb_array_length(public.gestion_lettre(tests.id('A'), null, -10) -> 'abonnes'), 50,
  'un décalage négatif vaut zéro');

-- Les avis : le décalage saute les premiers de l'onglet.
select ok(not exists (select 1 from pg_proc where proname = 'gestion_liste_avis' and pronargs = 3),
  'l''ancienne signature des avis a disparu : aucun appel ambigu');
select is(jsonb_array_length(public.gestion_liste_avis(tests.id('A'), 'publies', 50, 100000) -> 'avis'), 0,
  'au-delà du dernier avis : une page vide, pas une erreur');

select * from finish();
rollback;
