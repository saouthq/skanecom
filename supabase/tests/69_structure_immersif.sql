-- =====================================================================
-- 69 · La structure immersive, le lookbook, la pièce de la saison
-- =====================================================================
begin;
\ir outils.psql

select plan(14);

-- La structure
select lives_ok(format($$ update public.themes set code = 'immersif' where boutique_id = %L $$, tests.id('A')),
  'le thème accepte la structure immersive');
select is(public.boutique_publique('essai-a') #>> '{theme,code}', 'immersif', 'la vitrine lit la structure');

-- Le lookbook
select lives_ok(format($$ update public.themes set sections = %L where boutique_id = %L $$,
  '[{"type": "lookbook", "image": {"chemin": "essai-a/accueil/photo-aaaaaaaaaaaa.webp"},
     "textes": {"titre_fr": "Le lookbook"},
     "points": [{"x": 42.5, "y": 61, "produit": "robe-en-lin"}, {"x": 80, "y": 30, "produit": "sac-cuir"}]}]', tests.id('A')),
  'un lookbook : sa photo et deux points vers des produits');
select throws_ok(format($$ update public.themes set sections = %L where boutique_id = %L $$,
  '[{"type": "lookbook", "points": [{"x": 120, "y": 50, "produit": "robe-en-lin"}]}]', tests.id('A')),
  '23514', null, 'un point hors de la photo (x > 100) : refusé');
select throws_ok(format($$ update public.themes set sections = %L where boutique_id = %L $$,
  '[{"type": "lookbook", "points": [{"x": 10, "y": 50, "produit": "https://ailleurs.example"}]}]', tests.id('A')),
  '23514', null, 'un point qui mène ailleurs qu''à un produit : refusé');
select throws_ok(format($$ update public.themes set sections = %L where boutique_id = %L $$,
  '[{"type": "lookbook", "points": [{"x": 1, "y": 1, "produit": "robe-en-lin", "taille": 3}]}]', tests.id('A')),
  '23514', null, 'un point avec une clé inconnue : refusé');
select throws_ok(format($$ update public.themes set sections = %L where boutique_id = %L $$,
  (select jsonb_build_array(jsonb_build_object('type', 'lookbook', 'points',
     (select jsonb_agg(jsonb_build_object('x', 10, 'y', 10, 'produit', 'robe-en-lin')) from generate_series(1, 7)))))::text, tests.id('A')),
  '23514', null, 'sept points : refusé (six au plus)');
select throws_ok(format($$ update public.themes set sections = %L where boutique_id = %L $$,
  '[{"type": "hero", "points": [{"x": 10, "y": 10, "produit": "robe-en-lin"}]}]', tests.id('A')),
  '23514', null, 'des points ailleurs que sur un lookbook : refusés');

-- La pièce de la saison
select lives_ok(format($$ update public.themes set sections = %L where boutique_id = %L $$,
  '[{"type": "hero"}, {"type": "piece", "produit": "robe-en-lin", "textes": {"etiquette_fr": "La pièce de la saison"}}]', tests.id('A')),
  'une pièce de la saison : un produit');
select throws_ok(format($$ update public.themes set sections = %L where boutique_id = %L $$,
  '[{"type": "piece", "produit": "robe-en-lin"}, {"type": "piece", "produit": "sac-cuir"}]', tests.id('A')),
  '23514', null, 'deux pièces de la saison : refusées (une seule barre d''achat)');
select throws_ok(format($$ update public.themes set sections = %L where boutique_id = %L $$,
  '[{"type": "selection", "produit": "robe-en-lin"}]', tests.id('A')),
  '23514', null, 'un produit sur une autre section : refusé');

-- L'éditeur : un brouillon, puis la publication, en immersif
select tests.connecte('proprio_a');
select is(public.gestion_brouillon_apparence(tests.id('A'),
  '{"code": "immersif", "couleurs": {}, "polices": {}, "style": {}, "sections": [{"type": "lookbook", "points": [{"x": 50, "y": 50, "produit": "robe-en-lin"}]}]}'::jsonb, null) ->> 'version',
  '1', 'un brouillon en immersif, avec son lookbook');
select is((public.gestion_publier_apparence(tests.id('A'),
  '{"code": "immersif", "couleurs": {}, "polices": {}, "style": {}}'::jsonb,
  (public.gestion_apparence(tests.id('A')) ->> 'version')::integer) ->> 'version') is not null, true,
  'publier la structure immersive');

select is(jsonb_typeof(public.gestion_accueil(tests.id('A')) -> 'catalogue'), 'array',
  'l''éditeur reçoit les pièces publiées, à pointer ou à choisir');

select * from finish();
rollback;
