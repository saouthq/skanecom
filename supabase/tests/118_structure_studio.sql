-- =====================================================================
-- 118 · La structure Studio, les sections du site vitrine, les prix masqués
-- =====================================================================
begin;
\ir outils.psql

select plan(17);

-- La structure et son mouvement
select lives_ok(format($$ update public.themes set code = 'studio' where boutique_id = %L $$, tests.id('A')),
  'le thème accepte la structure Studio');
select is(public.boutique_publique('essai-a') #>> '{theme,code}', 'studio', 'la vitrine lit la structure');
select lives_ok(format($$ update public.themes set style = '{"animations": "expressives"}' where boutique_id = %L $$, tests.id('A')),
  'les animations « expressives » sont admises');
select throws_ok(format($$ update public.themes set style = '{"animations": "folles"}' where boutique_id = %L $$, tests.id('A')),
  '23514', null, 'des animations hors liste : refusées');
select lives_ok(format($$ update public.themes set style = '{"animations": "non"}' where boutique_id = %L $$, tests.id('A')),
  'sans animation : toujours admis');

-- Les services : numérotés, un titre et un texte chacun, une photo de la boutique
select lives_ok(format($$ update public.themes set sections = %L::jsonb where boutique_id = %L $$,
  '[{"type": "services", "image": {"chemin": "essai-a/accueil/photo-0123456789ab.webp"}, "lien": "/contact",
     "textes": {"titre_fr": "Ce que\nnous faisons", "s1_titre_fr": "Conception", "s1_texte_fr": "Plans, matières, lumière.",
                "s2_titre_fr": "Suivi de chantier", "image_alt_fr": "Un séjour"}}]', tests.id('A')),
  'des services : textes numérotés, photo, lien interne');
select is(public.boutique_publique('essai-a') #>> '{theme,sections,0,textes,s2_titre_fr}', 'Suivi de chantier', 'la vitrine lit les services');
select throws_ok(format($$ update public.themes set sections = %L::jsonb where boutique_id = %L $$,
  '[{"type": "services", "lien": "https://ailleurs.example"}]', tests.id('A')),
  '23514', null, 'un lien absolu : refusé');
select throws_ok(format($$ update public.themes set sections = %L::jsonb where boutique_id = %L $$,
  '[{"type": "services", "image": {"chemin": "essai-b/accueil/photo-0123456789ab.webp"}}]', tests.id('A')),
  '23514', null, 'la photo d''une autre boutique : refusée');
select throws_ok(format($$ update public.themes set sections = %L::jsonb where boutique_id = %L $$,
  jsonb_build_array(jsonb_build_object('type', 'services', 'textes', jsonb_build_object('s1_texte_fr', repeat('x', 601))))::text, tests.id('A')),
  '23514', null, 'un texte de plus de 600 caractères : refusé');

-- La méthode
select lives_ok(format($$ update public.themes set sections = %L::jsonb where boutique_id = %L $$,
  '[{"type": "etapes", "textes": {"titre_fr": "La méthode", "e1_titre_fr": "Écouter", "e2_titre_fr": "Dessiner"}}]', tests.id('A')),
  'des étapes : textes numérotés');
select throws_ok(format($$ update public.themes set sections = %L::jsonb where boutique_id = %L $$,
  '[{"type": "etapes", "produits": ["valise-cabine"]}]', tests.id('A')),
  '23514', null, 'une clé d''une autre section : refusée');

-- Le contact : un seul par accueil (son ancre est #contact)
select lives_ok(format($$ update public.themes set sections = %L::jsonb where boutique_id = %L $$,
  '[{"type": "hero"}, {"type": "contact", "textes": {"titre_fr": "Parlons de\nvotre projet."}}]', tests.id('A')),
  'une section de contact');
select throws_ok(format($$ update public.themes set sections = %L::jsonb where boutique_id = %L $$,
  '[{"type": "contact"}, {"type": "contact"}]', tests.id('A')),
  '23514', null, 'deux sections de contact : refusé');

-- Les prix masqués : un réglage public, coupé par défaut
select is(public.boutique_publique('essai-a') #>> '{configuration,reglages,vitrine.prix_masques}', 'false', 'prix masqués : coupé par défaut');
reset role; select tests.connecte('proprio_a');
select lives_ok(format($$ select public.gestion_enregistrer_reglages(%L, '{"vitrine.site_vitrine": true, "vitrine.prix_masques": true}'::jsonb) $$, tests.id('A')),
  'la boutique masque ses prix depuis ses réglages');
reset role;
select is(public.boutique_publique('essai-a') #>> '{configuration,reglages,vitrine.prix_masques}', 'true', 'la vitrine le lit');

select * from finish();
rollback;
