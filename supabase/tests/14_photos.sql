-- =====================================================================
-- 14 · Les photos des produits au backoffice
-- =====================================================================
begin;
\ir outils.psql

select plan(24);

-- Jeu d'essai (outils.psql) : produit_a a une photo, attitrée à variante_a
-- (essai-a/valise-noire.webp) ; produit_b dans la boutique B.

-- ---------------------------------------------------------------------
-- Portes
-- ---------------------------------------------------------------------
reset role; select tests.anonyme();
select throws_ok(format($$ select public.gestion_ajouter_photo(%L, %L, 'essai-a/produits/x.webp') $$, tests.id('A'), tests.id('produit_a')),
  '42501', null, 'un visiteur n''ajoute pas de photo');
reset role; select tests.connecte('prepa_a');
select throws_ok(format($$ select public.gestion_ajouter_photo(%L, %L, 'essai-a/produits/x.webp') $$, tests.id('A'), tests.id('produit_a')),
  '42501', null, 'la préparation non plus');
reset role; select tests.connecte('proprio_b');
select throws_ok(format($$ select public.gestion_ajouter_photo(%L, %L, 'essai-a/produits/x.webp') $$, tests.id('A'), tests.id('produit_a')),
  '42501', null, 'ni le propriétaire d''une autre boutique');

-- ---------------------------------------------------------------------
-- Ajouter
-- ---------------------------------------------------------------------
reset role; select tests.connecte('proprio_a');
select throws_like(format($$ select public.gestion_ajouter_photo(%L, %L, 'essai-b/produits/x.webp') $$, tests.id('A'), tests.id('produit_a')),
  '%essai-a/produits/%', 'une photo se range dans le dossier de SA boutique');
select throws_like(format($$ select public.gestion_ajouter_photo(%L, %L, 'essai-a/marque/x.webp') $$, tests.id('A'), tests.id('produit_a')),
  '%essai-a/produits/%', 'et sous produits/');
select throws_like(format($$ select public.gestion_ajouter_photo(%L, %L, 'essai-a/produits/../../essai-b/x.webp') $$, tests.id('A'), tests.id('produit_a')),
  '%Chemin de fichier invalide%', 'sans remonter les dossiers');
select throws_ok(format($$ select public.gestion_ajouter_photo(%L, %L, 'essai-a/produits/x.webp') $$, tests.id('A'), tests.id('produit_b')),
  'P0002', null, 'le produit d''une autre boutique est introuvable depuis A');

create temporary table photo (nom text primary key, id uuid);
grant all on photo to authenticated;
insert into photo values
  ('deux',  public.gestion_ajouter_photo(tests.id('A'), tests.id('produit_a'), 'essai-a/produits/valise-cabine/deux.webp', ' De face ')),
  ('trois', public.gestion_ajouter_photo(tests.id('A'), tests.id('produit_a'), 'essai-a/produits/valise-cabine/trois.webp'));
select results_eq(format($$ select chemin, alt_fr, position::int from public.produit_images where produit_id = %L order by position $$, tests.id('produit_a')),
  $$ values ('essai-a/valise-noire.webp'::text, null::text, 0), ('essai-a/produits/valise-cabine/deux.webp', 'De face', 1),
            ('essai-a/produits/valise-cabine/trois.webp', null, 2) $$,
  'les photos s''ajoutent à la suite, légende nettoyée');

-- ---------------------------------------------------------------------
-- Déplacer
-- ---------------------------------------------------------------------
select lives_ok(format($$ select public.gestion_deplacer_photo(%L, %L, 'premiere') $$, tests.id('A'), (select id from photo where nom = 'trois')),
  'la troisième passe en première');
select results_eq(format($$ select chemin from public.produit_images where produit_id = %L order by position $$, tests.id('produit_a')),
  $$ values ('essai-a/produits/valise-cabine/trois.webp'::text), ('essai-a/valise-noire.webp'), ('essai-a/produits/valise-cabine/deux.webp') $$,
  'et les autres suivent');
select lives_ok(format($$ select public.gestion_deplacer_photo(%L, %L, 'avant') $$, tests.id('A'), (select id from photo where nom = 'deux')),
  'une photo recule d''un cran');
select lives_ok(format($$ select public.gestion_deplacer_photo(%L, %L, 'avant') $$, tests.id('A'), (select id from photo where nom = 'trois')),
  'la première ne recule pas plus');
select lives_ok(format($$ select public.gestion_deplacer_photo(%L, %L, 'apres') $$, tests.id('A'), (select id from photo where nom = 'trois')),
  'elle avance d''un cran');
select results_eq(format($$ select chemin, position::int from public.produit_images where produit_id = %L order by position $$, tests.id('produit_a')),
  $$ values ('essai-a/produits/valise-cabine/deux.webp'::text, 0), ('essai-a/produits/valise-cabine/trois.webp', 1), ('essai-a/valise-noire.webp', 2) $$,
  'l''ordre suit, sans trou');
select throws_like(format($$ select public.gestion_deplacer_photo(%L, %L, 'ailleurs') $$, tests.id('A'), (select id from photo where nom = 'deux')),
  '%Déplacement inconnu%', 'un déplacement inconnu est refusé');

-- ---------------------------------------------------------------------
-- Légender, attitrer à une déclinaison
-- ---------------------------------------------------------------------
select lives_ok(format($$ select public.gestion_modifier_photo(%L, %L, 'Valise noire, de face', %L) $$,
                       tests.id('A'), (select id from photo where nom = 'deux'), tests.id('variante_a')),
  'la photo est attitrée à la déclinaison Noir');
select results_eq(format($$ select alt_fr, variante_id from public.produit_images where id = %L $$, (select id from photo where nom = 'deux')),
  format($$ values ('Valise noire, de face'::text, %L::uuid) $$, tests.id('variante_a')), 'avec sa légende');
select throws_like(format($$ select public.gestion_modifier_photo(%L, %L, null, %L) $$,
                          tests.id('A'), (select id from photo where nom = 'deux'), tests.id('variante_a_brouillon')),
  '%pas celle de ce produit%', 'la déclinaison d''un autre produit est refusée');
select lives_ok(format($$ select public.gestion_modifier_photo(%L, %L, '', null) $$, tests.id('A'), (select id from photo where nom = 'deux')),
  'elle revient à tout le produit');
select is((select variante_id from public.produit_images where id = (select id from photo where nom = 'deux')), null, 'sans déclinaison ni légende');

-- ---------------------------------------------------------------------
-- Retirer
-- ---------------------------------------------------------------------
select is(public.gestion_retirer_photo(tests.id('A'), (select id from photo where nom = 'trois')),
  '{"chemin": "essai-a/produits/valise-cabine/trois.webp", "orphelin": true}'::jsonb,
  'une photo retirée rend son chemin : plus rien ne s''en sert, le fichier peut partir');
select results_eq(format($$ select position::int from public.produit_images where produit_id = %L order by position $$, tests.id('produit_a')),
  $$ values (0), (1) $$, 'les autres se resserrent');

-- Le même fichier servant encore ailleurs (une déclinaison), il reste.
reset role;
update public.variantes set image_chemin = 'essai-a/produits/valise-cabine/deux.webp' where id = tests.id('variante_a_inactive');
select tests.connecte('proprio_a');
select is((public.gestion_retirer_photo(tests.id('A'), (select id from photo where nom = 'deux')) ->> 'orphelin')::boolean, false,
  'un fichier encore utilisé ailleurs dans la boutique n''est pas signalé à effacer');

-- Douze au plus.
reset role;
insert into public.produit_images (boutique_id, produit_id, chemin, position)
  select tests.id('A'), tests.id('produit_a'), 'essai-a/produits/valise-cabine/p' || n || '.webp', n from generate_series(1, 11) n;
select tests.connecte('proprio_a');
select throws_like(format($$ select public.gestion_ajouter_photo(%L, %L, 'essai-a/produits/valise-cabine/treize.webp') $$, tests.id('A'), tests.id('produit_a')),
  '%déjà 12 photos%', 'douze photos au plus par produit');

select * from finish();
rollback;
