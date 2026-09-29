-- =====================================================================
-- 07 · Vitrine : catalogue en base, cadre public, thème
-- =====================================================================
begin;
\ir outils.psql

select plan(39);

-- ---------------------------------------------------------------------
-- Catalogue d'essai plus riche dans A : rayons sur deux niveaux, un produit
-- à deux axes (couleur × taille), un produit d'un autre rayon.
--   bagages ─┬─ valises : Valise cabine (Noir 55 actif, Or inactif)
--            │            Valise duo    (Noir 75 en stock, Or 55 épuisé)
--            └─ sacs     : Sac de voyage (Gris, 90 TND)
-- ---------------------------------------------------------------------
insert into public.categories (id, boutique_id, slug, nom_fr, position)
values (tests.nouvel_id('cat_bagages'), tests.id('A'), 'bagages', 'Bagages', 0);
update public.categories set parent_id = tests.id('cat_bagages') where id = tests.id('cat_a');
insert into public.categories (id, boutique_id, parent_id, slug, nom_fr, position)
values (tests.nouvel_id('cat_sacs'), tests.id('A'), tests.id('cat_bagages'), 'sacs', 'Sacs', 2);

insert into public.produits (id, boutique_id, categorie_id, slug, nom_fr, marque, description_fr, publie, mis_en_avant, created_at) values
  (tests.nouvel_id('duo'), tests.id('A'), tests.id('cat_a'),    'valise-duo',    'Valise duo',    null,    'Deux tailles.',          true, false, now() + interval '1 minute'),
  (tests.nouvel_id('sac'), tests.id('A'), tests.id('cat_sacs'), 'sac-de-voyage', 'Sac de voyage', 'Atlas', 'Sac de voyage en toile.', true, true,  now() - interval '1 day');

insert into public.variantes (boutique_id, produit_id, sku, options, prix_millimes, stock, position) values
  (tests.id('A'), tests.id('duo'), 'DUO-75-NOIR', '{"couleur": "Noir", "taille": "75"}', 250000, 2, 1),
  (tests.id('A'), tests.id('duo'), 'DUO-55-OR',   '{"couleur": "Or",   "taille": "55"}', 210000, 0, 2),
  (tests.id('A'), tests.id('sac'), 'SAC-GRIS',    '{"couleur": "Gris"}',                 90000,  4, 1);

-- Tous les appels ci-dessous se font en visiteur anonyme, comme la vitrine.
create function tests.liste(p_filtres jsonb default '{}', p_tri text default 'nouveautes', p_page int default 1, p_par_page int default 24)
returns jsonb language sql stable as $$
  select public.liste_produits(tests.id('A'), p_filtres, p_tri, p_page, p_par_page)
$$;
create function tests.slugs(p_resultat jsonb) returns text[] language sql immutable as $$
  select coalesce(array_agg(e ->> 'slug' order by n), '{}') from jsonb_array_elements(p_resultat -> 'produits') with ordinality t(e, n)
$$;
create function tests.facette(p_resultat jsonb, p_axe text, p_valeur text) returns int language sql immutable as $$
  select (e ->> 'compte')::int from jsonb_array_elements(p_resultat -> 'facettes' -> 'options' -> p_axe) e where e ->> 'valeur' = p_valeur
$$;
grant execute on all functions in schema tests to anon, authenticated;

reset role; select tests.anonyme();

-- ---------------------------------------------------------------------
-- Ce que la liste contient
-- ---------------------------------------------------------------------
select is((tests.liste() ->> 'total')::int, 3, 'A liste ses 3 produits publiés, sans le brouillon');
select ok(not (tests.slugs(tests.liste()) && array['brouillon']), 'le brouillon n''apparaît jamais');
select is((public.liste_produits(tests.id('B')) ->> 'total')::int, 1, 'B ne liste que son produit');
select ok(not exists (select 1 from jsonb_array_elements(tests.liste() -> 'produits') e where (e ->> 'id')::uuid = tests.id('produit_b')),
  'le produit « valise-cabine » de B n''apparaît pas dans A, malgré le même slug');
select is((public.liste_produits(tests.id('C')) ->> 'total')::int, 0, 'une boutique suspendue ne liste rien');
select is(jsonb_array_length((select e -> 'variantes' from jsonb_array_elements(tests.liste() -> 'produits') e where e ->> 'slug' = 'valise-cabine')), 1,
  'une variante inactive n''est pas renvoyée');

-- ---------------------------------------------------------------------
-- Filtres
-- ---------------------------------------------------------------------
select is((tests.liste('{"options": {"couleur": ["Or"], "taille": ["55"]}}') ->> 'total')::int, 1,
  'Or en 55 existe (Valise duo)');
select is((tests.liste('{"options": {"couleur": ["Or"], "taille": ["75"]}}') ->> 'total')::int, 0,
  'Or en 75 n''existe pas : le duo a du Or en 55 et du 75 en Noir, il ne passe pas');
select is((tests.liste('{"options": {"couleur": "Gris"}}') ->> 'total')::int, 1,
  'une valeur seule vaut une liste d''une valeur');
select is((tests.liste('{"options": {"couleur": ["Or"]}, "en_stock": true}') ->> 'total')::int, 0,
  'en stock seulement : le duo Or est épuisé');
select is(tests.slugs(tests.liste('{"prix_max": 100000}')), array['sac-de-voyage'], 'jusqu''à 100 TND : le sac');
select is((tests.liste('{"rayon": "bagages"}') ->> 'total')::int, 3, 'un rayon inclut ses sous-rayons');
select is(tests.slugs(tests.liste('{"rayon": "sacs"}')), array['sac-de-voyage'], 'un sous-rayon seul');

-- ---------------------------------------------------------------------
-- Facettes
-- ---------------------------------------------------------------------
select is(tests.facette(tests.liste(), 'couleur', 'Noir'), 2, 'facette : 2 modèles en Noir');
select is(tests.facette(tests.liste(), 'couleur', 'Or'), 1, 'facette : 1 modèle en Or (l''Or inactif de la cabine ne compte pas)');
select is(tests.facette(tests.liste('{"options": {"couleur": ["Noir"]}}'), 'couleur', 'Gris'), 1,
  'la facette d''un axe ignore le filtre de ce même axe');
select is(tests.facette(tests.liste('{"options": {"couleur": ["Noir"]}}'), 'taille', '55'), 0,
  'une option qui ne donnerait rien est renvoyée à 0, pour s''afficher éteinte');
select is(tests.facette(tests.liste('{"options": {"couleur": ["Noir"]}}'), 'taille', '75'), 1,
  'en Noir, 1 modèle en 75');
select is((select array_agg(e ->> 'cle' order by n) from jsonb_array_elements(tests.liste() -> 'facettes' -> 'axes') with ordinality x(e, n)),
  array['couleur'], 'les axes déclarés sur les fiches du rayon, avec leur libellé');
select is((tests.liste() -> 'facettes' -> 'prix')::text, '{"max": 250000, "min": 90000}', 'bornes de prix du rayon');
select is(
  (select array_agg((e ->> 'slug') || '=' || (e ->> 'compte') order by e ->> 'slug') from jsonb_array_elements(tests.liste('{"rayon": "sacs"}') -> 'facettes' -> 'rayons') e),
  array['sacs=1', 'valises=2'], 'la facette des rayons ignore le filtre de rayon');

-- ---------------------------------------------------------------------
-- Recherche
-- ---------------------------------------------------------------------
select is(tests.slugs(tests.liste('{"q": "VAL-55"}', 'pertinence')), array['valise-cabine'], 'recherche par référence (SKU)');
select ok(tests.slugs(tests.liste('{"q": "valisse"}', 'pertinence')) @> array['valise-cabine', 'valise-duo']
      and not tests.slugs(tests.liste('{"q": "valisse"}', 'pertinence')) @> array['sac-de-voyage'],
  'une faute de frappe sur le nom trouve quand même les valises');
select is(tests.slugs(tests.liste('{"q": "toile"}')), array['sac-de-voyage'], 'recherche dans la description');
select is((tests.liste('{"q": "%"}') ->> 'total')::int, 0, 'un joker saisi est pris au pied de la lettre');

-- ---------------------------------------------------------------------
-- Tri et pagination
-- ---------------------------------------------------------------------
select is(tests.slugs(tests.liste('{}', 'prix-asc')), array['sac-de-voyage', 'valise-cabine', 'valise-duo'], 'tri par prix croissant (prix le plus bas de chaque produit)');
select is(tests.slugs(tests.liste('{}', 'prix-asc', 2, 1)), array['valise-cabine'], 'page 2 d''une page par produit');
select is((tests.slugs(tests.liste('{}', 'selection')))[1], 'sac-de-voyage', 'la sélection met en tête les produits mis en avant');
select is((tests.slugs(tests.liste('{}', 'nouveautes')))[1], 'valise-duo', 'nouveautés d''abord');
select throws_ok($$ select tests.liste('{"options": ["Noir"]}') $$, '22023', null, 'des options mal formées sont refusées');

-- ---------------------------------------------------------------------
-- Cadre public
-- ---------------------------------------------------------------------
select is(public.boutique_publique('essai-a') #>> '{boutique,hote_principal}', 'essai-a.test', 'le cadre donne le domaine principal');
select is(public.boutique_publique('essai-a') #>> '{configuration,reglages,livraison.mode_frais}', 'zone', 'et les réglages publics effectifs');
select is(public.boutique_publique('essai-a') #>> '{theme,couleurs,accent}', '#8A6224', 'et le thème');
select ok(not exists (select 1 from jsonb_array_elements(public.boutique_publique('essai-a') -> 'categories') c where c ->> 'slug' = 'archives'),
  'un rayon inactif n''est pas dans le cadre');
select is(public.boutique_publique('essai-suspendue'), null, 'une boutique suspendue n''a pas de cadre');

-- ---------------------------------------------------------------------
-- Thème : listes fermées, rien ne passe dans la balise <style>
-- ---------------------------------------------------------------------
reset role; select tests.connecte('proprio_a');
select throws_like($$ update public.themes set couleurs = '{"accent": "red;}</style><script>alert(1)</script>"}' $$,
  '%doit valoir #RRGGBB%', 'une couleur qui n''est pas #RRGGBB est refusée (injection dans la balise <style>)');
select throws_like(format($$ update public.themes set sections = '[{"type": "hero", "image": {"chemin": "essai-b/photo.webp"}}]' where boutique_id = %L $$, tests.id('A')),
  'Chemin de fichier invalide%', 'une section ne montre pas une image rangée chez une autre boutique');
select throws_like(format($$ update public.themes set sections = '[{"type": "hero", "lien": "//site-pirate.example/"}]' where boutique_id = %L $$, tests.id('A')),
  '%lien interne attendu%', 'un lien de section ne mène jamais hors de la boutique (« //autre-site »)');
select throws_like(format($$ update public.themes set sections = '[{"type": "editorial", "lien": "https://site-pirate.example/"}]' where boutique_id = %L $$, tests.id('A')),
  '%lien interne attendu%', 'ni vers une autre origine (« https://… »)');

reset role;
select * from finish();
rollback;
