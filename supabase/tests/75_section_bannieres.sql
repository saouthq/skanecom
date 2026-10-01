-- =====================================================================
-- 75 · La section « bannières » (bannières défilantes)
-- =====================================================================
begin;
\ir outils.psql

select plan(11);

-- Deux bannières : photo et cadrage pour téléphone, textes, lien vers un rayon.
select lives_ok(format($$ update public.themes set sections = %L::jsonb where boutique_id = %L $$,
  '[{"type": "bannieres", "textes": {"titre_fr": "Ce mois-ci"}, "diapos": [
     {"image": {"chemin": "essai-a/accueil/photo-0123456789ab.webp", "chemin_portrait": "essai-a/accueil/photo-ba9876543210.webp"},
      "textes": {"titre_fr": "Les valises cabine", "texte_fr": "Légères, quatre roues.", "cta_fr": "Voir le rayon", "image_alt_fr": "Une valise au pied d''un lit"},
      "lien": "/categorie/valises"},
     {"textes": {"titre_fr": "Payé à la livraison"}}
   ]}]', tests.id('A')),
  'des bannières : deux diapos, photos de la boutique, lien interne');
select is(jsonb_array_length(public.boutique_publique('essai-a') #> '{theme,sections,0,diapos}'), 2, 'la vitrine lit les deux diapos');

select throws_ok(format($$ update public.themes set sections = %L::jsonb where boutique_id = %L $$,
  '[{"type": "bannieres", "diapos": [{}, {}, {}, {}, {}, {}]}]', tests.id('A')),
  '23514', null, 'six diapos : refusé (cinq au plus)');
select throws_ok(format($$ update public.themes set sections = %L::jsonb where boutique_id = %L $$,
  '[{"type": "bannieres", "diapos": []}]', tests.id('A')),
  '23514', null, 'aucune diapo : refusé');
select throws_ok(format($$ update public.themes set sections = %L::jsonb where boutique_id = %L $$,
  '[{"type": "bannieres", "diapos": [{"lien": "//ailleurs.example/offre"}]}]', tests.id('A')),
  '23514', null, 'un lien vers une autre origine : refusé');
select throws_ok(format($$ update public.themes set sections = %L::jsonb where boutique_id = %L $$,
  '[{"type": "bannieres", "diapos": [{"lien": "https://ailleurs.example"}]}]', tests.id('A')),
  '23514', null, 'un lien absolu : refusé');
select throws_ok(format($$ update public.themes set sections = %L::jsonb where boutique_id = %L $$,
  '[{"type": "bannieres", "diapos": [{"video": "essai-a/accueil/film.mp4"}]}]', tests.id('A')),
  '23514', null, 'une clé inconnue dans une diapo : refusée');
select throws_ok(format($$ update public.themes set sections = %L::jsonb where boutique_id = %L $$,
  '[{"type": "bannieres", "diapos": [{"image": {"chemin": "essai-b/accueil/photo-0123456789ab.webp"}}]}]', tests.id('A')),
  '23514', null, 'la photo d''une autre boutique : refusée');
select throws_ok(format($$ update public.themes set sections = %L::jsonb where boutique_id = %L $$,
  '[{"type": "editorial", "diapos": [{"textes": {"titre_fr": "Non"}}]}]', tests.id('A')),
  '23514', null, 'des diapos sur un récit : refusées');

-- Les photos employées : celles des diapos comptent (le dépôt ne les retire pas).
select is(
  (select array_agg(c order by c) from private.photos_sections(
    '[{"type": "editorial", "image": {"chemin": "essai-a/accueil/recit.webp"}},
      {"type": "bannieres", "diapos": [{"image": {"chemin": "essai-a/accueil/b1.webp", "chemin_portrait": "essai-a/accueil/b1-portrait.webp"}}, {"textes": {}}]}]'::jsonb) c),
  array['essai-a/accueil/b1-portrait.webp', 'essai-a/accueil/b1.webp', 'essai-a/accueil/recit.webp'],
  'les photos des diapos (et leur cadrage) sont des photos employées');

-- L'éditeur : un brouillon avec des bannières, par le propriétaire.
select tests.connecte('proprio_a');
select is(public.gestion_brouillon_apparence(tests.id('A'),
  '{"code": "editorial", "couleurs": {}, "polices": {}, "style": {}, "sections": [{"type": "hero"}, {"type": "bannieres", "diapos": [{"textes": {"titre_fr": "Nouveautés"}, "lien": "/catalogue"}]}]}'::jsonb, null) ->> 'version',
  '1', 'un brouillon avec des bannières');

select * from finish();
rollback;
