-- =====================================================================
-- 65 · Une troisième structure : le Bento
-- =====================================================================
begin;
\ir outils.psql

select plan(5);

select lives_ok(format($$ update public.themes set code = 'bento' where boutique_id = %L $$, tests.id('A')),
  'le thème accepte la structure Bento');
select throws_ok(format($$ update public.themes set code = 'mosaique' where boutique_id = %L $$, tests.id('A')),
  '23514', null, 'une structure inconnue : refusée');
select is(public.boutique_publique('essai-a') #>> '{theme,code}', 'bento', 'la vitrine lit la structure');

select tests.connecte('proprio_a');
select is((public.gestion_publier_apparence(tests.id('A'),
  '{"code": "editorial", "couleurs": {}, "polices": {}, "style": {}}'::jsonb,
  (public.gestion_apparence(tests.id('A')) ->> 'version')::integer) ->> 'version') is not null, true,
  'publier une autre structure');
select is(public.gestion_brouillon_apparence(tests.id('A'),
  '{"code": "bento", "couleurs": {}, "polices": {}, "style": {"coins": "ronds", "boutons": "pilule"}}'::jsonb, null) ->> 'version',
  '1', 'un brouillon en Bento');

select * from finish();
rollback;
