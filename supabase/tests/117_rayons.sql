-- =====================================================================
-- 117 · Les rayons au backoffice : créer, imbriquer, renommer (l'ancienne
-- adresse redirige), ordonner, masquer, image, retirer sans rien perdre
-- =====================================================================
begin;
\ir outils.psql

select plan(27);

-- Créer ------------------------------------------------------------------
select tests.connecte('proprio_a');
create temp table r (cle text primary key, id uuid) on commit drop;
grant all on r to authenticated;
insert into r select 'cabine', (public.gestion_creer_rayon(tests.id('A'), 'Cabine', 'cabine', tests.id('cat_a')) ->> 'id')::uuid;
select is((select parent_id from public.categories where id = (select id from r where cle = 'cabine')), tests.id('cat_a'),
  'un sous-rayon naît dans son rayon');
select is((public.gestion_creer_rayon(tests.id('A'), 'Valises bis', 'valises', null) ->> 'slug'), 'valises-2',
  'une adresse prise : la suivante, libre (« valises-2 »)');
insert into r select 'rigides', (public.gestion_creer_rayon(tests.id('A'), 'Rigides', 'rigides', (select id from r where cle = 'cabine')) ->> 'id')::uuid;
select ok((select id from r where cle = 'rigides') is not null, 'trois niveaux : Valises › Cabine › Rigides');
select throws_ok(format($$ select public.gestion_creer_rayon(%L, 'Trop', 'trop', %L) $$, tests.id('A'), (select id from r where cle = 'rigides')),
  '23514', null, 'un quatrième niveau est refusé');
select throws_ok(format($$ select public.gestion_creer_rayon(%L, '', 'vide', null) $$, tests.id('A')),
  '23514', null, 'un rayon sans nom est refusé');
select throws_ok(format($$ select public.gestion_creer_rayon(%L, 'Bizarre', 'Pas Une Adresse', null) $$, tests.id('A')),
  '23514', null, 'une adresse illisible est refusée');

-- Les rôles ---------------------------------------------------------------
select tests.connecte('lecture_a');
select ok(jsonb_array_length(public.gestion_rayons(tests.id('A'))) >= 4, 'toute l''équipe lit les rayons');
select throws_ok(format($$ select public.gestion_creer_rayon(%L, 'Lecture', 'lecture', null) $$, tests.id('A')),
  '42501', null, 'la lecture seule ne crée pas de rayon');
select tests.connecte('proprio_b');
select throws_ok(format($$ select public.gestion_rayons(%L) $$, tests.id('A')), '42501', null, 'une autre boutique ne lit rien');
select throws_ok(format($$ select public.gestion_creer_rayon(%L, 'Pirate', 'pirate', null) $$, tests.id('A')), '42501', null,
  'une autre boutique ne crée rien');

-- Ce que contient chaque rayon ---------------------------------------------
select tests.connecte('proprio_a');
select is((select (x ->> 'produits')::int from jsonb_array_elements(public.gestion_rayons(tests.id('A'))) x where x ->> 'id' = tests.id('cat_a')::text), 2,
  'la liste dit combien de produits a chaque rayon');
select is((select (x ->> 'sous_rayons')::int from jsonb_array_elements(public.gestion_rayons(tests.id('A'))) x where x ->> 'id' = tests.id('cat_a')::text), 1,
  'et combien de sous-rayons');

-- Modifier : l'adresse changée redirige ------------------------------------
select lives_ok(format($$ select public.gestion_modifier_rayon(%L, %L, null, '{"nom": "Bagages", "slug": "bagages", "description": "Pour voyager", "parent_id": "", "actif": true}') $$,
  tests.id('A'), tests.id('cat_a')), 'renommer un rayon et changer son adresse');
select tests.anonyme();
select is(public.rayon_par_ancienne_adresse(tests.id('A'), 'valises'), 'bagages', 'l''ancienne adresse mène à la nouvelle (la vitrine redirige)');
select is(public.rayon_par_ancienne_adresse(tests.id('B'), 'valises'), null, 'chez une autre boutique, rien');
select tests.connecte('proprio_a');
select throws_ok(format($$ select public.gestion_modifier_rayon(%L, %L, null, '{"nom": "Cabine", "slug": "bagages", "parent_id": %s}') $$,
  tests.id('A'), (select id from r where cle = 'cabine'), to_jsonb(tests.id('cat_a')::text)), '23514', null,
  'l''adresse d''un autre rayon est refusée');
select throws_ok(format($$ select public.gestion_modifier_rayon(%L, %L, null, '{"nom": "Bagages", "slug": "bagages", "parent_id": %s}') $$,
  tests.id('A'), tests.id('cat_a'), to_jsonb((select id from r where cle = 'rigides')::text)), '23514', null,
  'un rayon ne va pas dans son propre sous-rayon');
select throws_ok(format($$ select public.gestion_modifier_rayon(%L, %L, '2000-01-01', '{"nom": "X", "slug": "x"}') $$,
  tests.id('A'), tests.id('cat_a')), '23514', null, 'une fiche modifiée entre-temps est refusée');

-- Ordonner -----------------------------------------------------------------
select public.gestion_deplacer_rayon(tests.id('A'), (select id from public.categories where boutique_id = tests.id('A') and slug = 'valises-2'), 'haut');
select ok((select position from public.categories where boutique_id = tests.id('A') and slug = 'valises-2')
         < (select position from public.categories where id = tests.id('cat_a')),
  'monter un rayon : il passe devant son voisin');

-- Masquer : la vitrine ne le montre plus -----------------------------------
select public.gestion_modifier_rayon(tests.id('A'), (select id from r where cle = 'cabine'), null,
  jsonb_build_object('nom', 'Cabine', 'slug', 'cabine', 'parent_id', tests.id('cat_a'), 'actif', false));
select tests.anonyme();
select ok(not exists (select 1 from jsonb_array_elements(public.boutique_publique('essai-a') -> 'categories') x where x ->> 'slug' = 'cabine'),
  'un rayon masqué quitte la vitrine');

-- Image --------------------------------------------------------------------
select tests.connecte('proprio_a');
select throws_ok(format($$ select public.gestion_image_rayon(%L, %L, 'essai-b/rayons/%s/abcdefabcdef.webp') $$,
  tests.id('A'), tests.id('cat_a'), tests.id('cat_a')), '23514', null, 'une image hors du dossier de la boutique est refusée');
select is(public.gestion_image_rayon(tests.id('A'), tests.id('cat_a'), format('essai-a/rayons/%s/abcdefabcdef.webp', tests.id('cat_a'))), null,
  'une image posée (il n''y en avait pas)');

-- Retirer : les produits vont où l'on dit, les sous-rayons montent ---------
select is(public.gestion_retirer_rayon(tests.id('A'), tests.id('cat_a'), (select id from public.categories where boutique_id = tests.id('A') and slug = 'valises-2')) ->> 'produits', '2',
  'retirer un rayon : ses deux produits partent dans le rayon choisi');
select is((select parent_id from public.categories where id = (select id from r where cle = 'cabine')), null,
  'ses sous-rayons montent d''un niveau');
select tests.anonyme();
select is(public.rayon_par_ancienne_adresse(tests.id('A'), 'bagages'), 'valises-2',
  'l''adresse du rayon retiré mène au rayon qui a reçu ses produits');
select is(public.rayon_par_ancienne_adresse(tests.id('A'), 'valises'), 'valises-2',
  'et celles qu''il avait quittées aussi');
select tests.connecte('proprio_a');
reset role;
select is((select count(*)::int from plateforme.journal_audit where boutique_id = tests.id('A') and action like 'rayon.%'), 8,
  'chaque geste réussi est au journal (trois créations, deux fiches, un ordre, une image, un retrait)');

select * from finish();
rollback;
