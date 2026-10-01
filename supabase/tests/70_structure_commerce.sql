-- =====================================================================
-- 70 · La structure Commerce
-- =====================================================================
begin;
\ir outils.psql

select plan(5);

select lives_ok(format($$ update public.themes set code = 'commerce' where boutique_id = %L $$, tests.id('A')),
  'le thème accepte la structure Commerce');
select is(public.boutique_publique('essai-a') #>> '{theme,code}', 'commerce', 'la vitrine lit la structure');
select throws_ok(format($$ update public.themes set code = 'supermarche' where boutique_id = %L $$, tests.id('A')),
  '23514', null, 'une structure inconnue : refusée');

-- L'éditeur : un brouillon, puis la publication, en Commerce
select tests.connecte('proprio_a');
select is(public.gestion_brouillon_apparence(tests.id('A'),
  '{"code": "commerce", "couleurs": {}, "polices": {}, "style": {}, "sections": [{"type": "hero"}, {"type": "engagements"}, {"type": "rayons"}]}'::jsonb, null) ->> 'version',
  '1', 'un brouillon en Commerce');
select is((public.gestion_publier_apparence(tests.id('A'),
  '{"code": "commerce", "couleurs": {}, "polices": {}, "style": {}}'::jsonb,
  (public.gestion_apparence(tests.id('A')) ->> 'version')::integer) ->> 'version') is not null, true,
  'publier la structure Commerce');

select * from finish();
rollback;
