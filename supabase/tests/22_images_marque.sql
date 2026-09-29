-- =====================================================================
-- 22 · Le logo et les images de la marque, depuis la console
-- =====================================================================
begin;
\ir outils.psql

select plan(31);

-- Jeu d'essai (outils.psql) : A (essai-a) en éditorial, B (essai-b) en
-- technique, tous deux sans logo et avec les sections de leur gabarit
-- (colonne vide).

-- Les sections d'accueil des gabarits, telles que la console les fournit.
create function tests.gabarit(p_code text) returns jsonb language sql as $$
  select case p_code
    when 'editorial' then '[{"type": "hero", "textes": {}}, {"type": "rayons", "textes": {}}, {"type": "selection", "textes": {}, "nombre": 8},
                            {"type": "editorial", "textes": {}}, {"type": "engagements", "textes": {}}]'::jsonb
    else '[{"type": "hero", "textes": {}}, {"type": "rayons", "textes": {}}, {"type": "selection", "textes": {}, "nombre": 10},
           {"type": "engagements", "textes": {}}]'::jsonb end
$$;

-- Un geste de l'administrateur, à la version en cours.
create function tests.image(p_emplacement text, p_image jsonb, p_gabarit jsonb default null, p_boutique text default 'A')
returns jsonb language sql as $$
  select public.console_image_marque(tests.id('admin_plateforme'), tests.id(p_boutique),
    (select t.version from public.themes t where t.boutique_id = tests.id(p_boutique)), p_emplacement, p_image, p_gabarit)
$$;

create function tests.theme(p_boutique text default 'A') returns public.themes language sql as $$
  select t.* from public.themes t where t.boutique_id = tests.id(p_boutique)
$$;

create temporary table rendu (version integer);
grant all on rendu to service_role;

-- ---------------------------------------------------------------------
-- Portes
-- ---------------------------------------------------------------------
reset role; select tests.anonyme();
select throws_ok(format($$ select public.console_image_marque(%L, %L, 1, 'logo', '{"chemin": "essai-a/marque/x.png"}') $$,
                        tests.id('admin_plateforme'), tests.id('A')),
  '42501', null, 'un visiteur ne pose pas de logo');
reset role; select tests.connecte('proprio_a');
select throws_ok(format($$ select public.console_image_marque(%L, %L, 1, 'logo', '{"chemin": "essai-a/marque/x.png"}') $$,
                        tests.id('proprio_a'), tests.id('A')),
  '42501', null, 'le propriétaire non plus : la marque se règle à la console');

reset role; select tests.service();
select throws_ok(format($$ select public.console_image_marque(%L, %L, 1, 'logo', '{"chemin": "essai-a/marque/x.png"}') $$,
                        tests.id('proprio_a'), tests.id('A')),
  '42501', null, 'la base refuse un acteur qui n''est pas administrateur de la plateforme');

-- ---------------------------------------------------------------------
-- Ce qui est refusé
-- ---------------------------------------------------------------------
select throws_like($$ select tests.image('bandeau', '{"chemin": "essai-a/marque/x.png"}') $$,
  '%Emplacement d''image inconnu%', 'un emplacement inconnu');
select throws_like($$ select tests.image('logo', '{"chemin": "essai-a/produits/x.png"}') $$,
  '%essai-a/marque/%', 'un fichier hors du dossier « marque » de la boutique');
select throws_like($$ select tests.image('logo', '{"chemin": "essai-b/marque/x.png"}') $$,
  '%essai-a/marque/%', 'le fichier d''une autre boutique');
select throws_like(format($$ select public.console_image_marque(%L, %L, 999, 'logo', '{"chemin": "essai-a/marque/x.png"}') $$,
                          tests.id('admin_plateforme'), tests.id('A')),
  '%modifié entre-temps%', 'une version dépassée : quelqu''un a enregistré entre-temps');
select throws_like($$ select tests.image('monogramme', '{"chemin": "essai-a/marque/m.png", "ratio": 1}') $$,
  '%seul le logo a une proportion%', 'une proportion ailleurs que sur le logo');
select throws_like($$ select tests.image('logo', '{"chemin": "essai-a/marque/x.png", "alt": "Logo"}') $$,
  '%seules les photos de l''accueil%', 'une description ailleurs que sur une photo de l''accueil');
select throws_like($$ select tests.image('logo', '{"chemin": "essai-a/marque/x.png", "ratio": 40}') $$,
  '%logo_ratio%', 'un logo démesurément allongé (la base garde sa borne)');

-- ---------------------------------------------------------------------
-- Le logo, le monogramme, l'icône
-- ---------------------------------------------------------------------
select is(tests.image('logo', '{"chemin": "essai-a/marque/logo-1.png", "ratio": 4.2567}') -> 'orphelins', '[]'::jsonb,
  'un premier logo ne laisse rien derrière lui');
select results_eq($$ select (tests.theme()).logo_chemin, (tests.theme()).logo_ratio $$,
  $$ values ('essai-a/marque/logo-1.png'::text, 4.257::numeric(6, 3)) $$, 'le logo et sa proportion sont posés');
select is(tests.image('logo', '{"chemin": "essai-a/marque/logo-2.png", "ratio": 3}') -> 'orphelins', '["essai-a/marque/logo-1.png"]'::jsonb,
  'le logo remplacé est rendu, pour être retiré du dépôt');
select throws_like($$ select tests.image('logo', '{"mode": "couleur"}') $$,
  '%logo_mode%', 'un mode d''affichage inconnu');
select is(tests.image('logo', '{"mode": "image"}') -> 'orphelins', '[]'::jsonb, 'le logo passe en couleurs, sans toucher au fichier');
select is(tests.image('monogramme', '{"chemin": "essai-a/marque/logo-2.png"}') -> 'orphelins', '[]'::jsonb,
  'un même fichier peut servir deux fois');
select is(tests.image('logo', '{"chemin": null}') -> 'orphelins', '[]'::jsonb,
  'retirer le logo ne rend pas un fichier que le monogramme emploie encore');
select is((tests.theme()).logo_chemin, null, 'sans logo, le nom de la boutique s''affiche');
insert into rendu select (tests.image('favicon', '{"chemin": "essai-a/marque/icone.png"}') ->> 'version')::integer;
select is((tests.theme()).favicon_chemin, 'essai-a/marque/icone.png', 'l''icône d''onglet est posée');
select is((select version from rendu), (tests.theme()).version, 'et la nouvelle version est rendue à l''écran, qui la garde pour la suite');

-- ---------------------------------------------------------------------
-- Les photos de l'accueil
-- ---------------------------------------------------------------------
select throws_like($$ select tests.image('ouverture', '{"chemin": "essai-a/marque/ouverture.webp"}') $$,
  '%pas de section « ouverture »%', 'sans sections en base ni celles du gabarit, rien où poser la photo');
select throws_like($$ select tests.image('ouverture_portrait', '{"chemin": "essai-a/marque/portrait.webp"}', tests.gabarit('editorial')) $$,
  '%Posez d''abord la photo d''ouverture%', 'le cadrage pour téléphone complète une photo d''ouverture, il ne la remplace pas');
select lives_ok($$ select tests.image('ouverture', '{"chemin": "essai-a/marque/ouverture.webp"}', tests.gabarit('editorial')) $$,
  'la photo d''ouverture est posée');
select results_eq($$ select jsonb_array_length((tests.theme()).sections), (tests.theme()).sections -> 0 -> 'image' ->> 'chemin',
                            (tests.theme()).sections -> 3 ->> 'type' $$,
  $$ values (5, 'essai-a/marque/ouverture.webp'::text, 'editorial'::text) $$,
  'les sections du gabarit sont fixées en base, la photo dans l''ouverture');
select lives_ok($$ select tests.image('ouverture_portrait', '{"chemin": "essai-a/marque/portrait.webp"}', tests.gabarit('editorial')) $$,
  'puis son cadrage pour téléphone');
select is(tests.image('ouverture', '{"alt": "  Valise rouge dans une salle d''embarquement  "}') -> 'orphelins', '[]'::jsonb,
  'la description se pose sans toucher au fichier');
select is((tests.theme()).sections -> 0 -> 'textes' ->> 'image_alt_fr', 'Valise rouge dans une salle d''embarquement',
  'la description est gardée avec les textes de la section, sans espaces autour');
select throws_like(format($$ select tests.image('recit', %L) $$, jsonb_build_object('alt', repeat('x', 201))),
  '%200 caractères%', 'une description tient en 200 caractères');
select is(tests.image('ouverture', '{"chemin": null}') -> 'orphelins', '["essai-a/marque/ouverture.webp", "essai-a/marque/portrait.webp"]'::jsonb,
  'retirer la photo d''ouverture retire aussi son cadrage pour téléphone');
select throws_like($$ select tests.image('recit', '{"chemin": "essai-b/marque/recit.webp"}', tests.gabarit('technique'), 'B') $$,
  '%pas de section « récit »%', 'le gabarit technique n''a pas de récit : rien où poser la photo');

select is((select count(*)::int from plateforme.journal_audit
            where boutique_id = tests.id('A') and action = 'theme.image' and acteur = tests.id('admin_plateforme')),
  10, 'chaque geste est au journal d''audit, avec son auteur');

select * from finish();
rollback;
