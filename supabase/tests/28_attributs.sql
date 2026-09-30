-- =====================================================================
-- 28 · Les fiches techniques : caractéristiques par rayon, filtrables (B9)
-- =====================================================================
begin;
\ir outils.psql

select plan(30);

-- Jeu d'essai (outils.psql) : dans A, le rayon Valises (cat_a) et
-- produit_a, publié (déclinaison Noir en stock, Or inactive) ; dans B,
-- cat_b ; C est suspendue. On ajoute à A une seconde valise publiée.
insert into public.produits (id, boutique_id, categorie_id, slug, nom_fr, publie)
values (tests.nouvel_id('produit_a2'), tests.id('A'), tests.id('cat_a'), 'valise-soute', 'Valise soute', true);
insert into public.variantes (boutique_id, produit_id, sku, options, prix_millimes, stock, actif)
values (tests.id('A'), tests.id('produit_a2'), 'VAL-75-NOIR', '{"couleur": "Noir"}', 259000, 3, true);

create function tests.car(p_produit text) returns jsonb language sql as $$
  select caracteristiques from public.produits where id = tests.id(p_produit)
$$;
create function tests.version(p_produit text) returns timestamptz language sql as $$
  select updated_at from public.produits where id = tests.id(p_produit)
$$;
create function tests.liste(p_filtres jsonb default '{}') returns jsonb language sql as $$
  select public.liste_produits(tests.id('A'), p_filtres)
$$;
grant execute on all functions in schema tests to anon, authenticated;

-- ---------------------------------------------------------------------
-- Portes
-- ---------------------------------------------------------------------
reset role; select tests.anonyme();
select throws_ok(format($$ select public.gestion_enregistrer_attribut(%L, null, 'volume', 'Volume', 'L', 'nombre', true, false, '{}') $$,
  tests.id('A')), '42501', null, 'un visiteur ne définit rien');
reset role; select tests.connecte('lecture_a');
select lives_ok(format($$ select public.gestion_attributs(%L) $$, tests.id('A')), 'l''équipe lit les caractéristiques');
select throws_ok(format($$ select public.gestion_enregistrer_attribut(%L, null, 'volume', 'Volume', 'L', 'nombre', true, false, '{}') $$,
  tests.id('A')), '42501', null, 'la lecture seule n''en crée pas');
reset role; select tests.connecte('proprio_b');
select throws_ok(format($$ select public.gestion_enregistrer_attribut(%L, null, 'volume', 'Volume', 'L', 'nombre', true, false, '{}') $$,
  tests.id('A')), '42501', null, 'ni le propriétaire d''une autre boutique');
reset role; select tests.connecte('proprio_a');
select throws_ok($$ insert into public.attributs (boutique_id, cle, label_fr) select boutique_id, 'x', 'X' from public.produits limit 1 $$,
  '42501', null, 'aucune écriture directe : seulement par les fonctions');

-- ---------------------------------------------------------------------
-- Définir
-- ---------------------------------------------------------------------
create temp table ids (nom text, id uuid);
insert into ids select 'volume', public.gestion_enregistrer_attribut(tests.id('A'), null, 'volume', ' Volume ', 'L', 'nombre', true, false, array[tests.id('cat_a')]);
insert into ids select 'garantie', public.gestion_enregistrer_attribut(tests.id('A'), null, 'garantie', 'Garantie', null, 'texte', false, true, '{}');
select throws_like(format($$ select public.gestion_enregistrer_attribut(%L, null, 'volume', 'Volume', null, 'texte', true, false, '{}') $$,
  tests.id('A')), '%porte déjà ce nom%', 'deux caractéristiques ne portent pas le même nom');
select throws_like(format($$ select public.gestion_enregistrer_attribut(%L, null, 'poids', 'Poids', 'kg', 'date', true, false, '{}') $$,
  tests.id('A')), '%un nombre, ou un texte%', 'deux types : nombre ou texte');
select throws_like(format($$ select public.gestion_enregistrer_attribut(%L, null, 'poids', 'Poids', 'kg', 'nombre', true, false, %L) $$,
  tests.id('A'), array[tests.id('cat_b')]), '%Rayon inconnu%', 'le rayon d''une autre boutique est refusé');
select results_eq($$ select x ->> 'cle', x ->> 'label', x ->> 'unite', jsonb_array_length(x -> 'rayons')
                      from jsonb_array_elements(public.gestion_attributs(tests.id('A'))) x $$,
  $$ values ('volume'::text, 'Volume'::text, 'L'::text, 1), ('garantie', 'Garantie', null, 0) $$,
  'les caractéristiques de la boutique, dans l''ordre de leur création, avec leurs rayons');

-- ---------------------------------------------------------------------
-- La fiche technique d'un produit
-- ---------------------------------------------------------------------
select results_eq($$ select x ->> 'cle', x ->> 'valeur' from jsonb_array_elements(public.gestion_fiche_technique(tests.id('A'), tests.id('produit_a')) -> 'attributs') x $$,
  $$ values ('volume'::text, null::text), ('garantie', null) $$,
  'à remplir : la caractéristique de son rayon, et celle de tout le catalogue');
select lives_ok(format($$ select public.gestion_enregistrer_caracteristiques(%L, %L, %L, '{"volume": " 38,5 L ", "garantie": "5 ans"}') $$,
  tests.id('A'), tests.id('produit_a'), tests.version('produit_a')), 'la fiche technique s''enregistre');
select is(tests.car('produit_a'), '{"volume": "38.5", "garantie": "5 ans"}'::jsonb,
  'le nombre est lu à la française, l''unité saisie par habitude est ôtée');
select throws_like(format($$ select public.gestion_enregistrer_caracteristiques(%L, %L, %L, '{"garantie": "2 ans"}') $$,
  tests.id('A'), tests.id('produit_a'), '2020-01-01'), '%modifiée entre-temps%', 'une fiche modifiée entre-temps est refusée');
select throws_like(format($$ select public.gestion_enregistrer_caracteristiques(%L, %L, null, '{"volume": "grand"}') $$,
  tests.id('A'), tests.id('produit_a')), '%attend un nombre%', 'un nombre attend un nombre');
select throws_like(format($$ select public.gestion_enregistrer_caracteristiques(%L, %L, null, '{"couleur_coque": "rouge"}') $$,
  tests.id('A'), tests.id('produit_a')), '%inconnue%', 'une caractéristique inconnue est refusée');
select throws_like(format($$ update public.produits set caracteristiques = '{"inconnue": "x"}' where id = %L $$, tests.id('produit_a')),
  '%inconnue%', 'même écrite directement, la base vérifie chaque valeur');
select public.gestion_enregistrer_caracteristiques(tests.id('A'), tests.id('produit_a2'), null, '{"volume": "100"}');

-- ---------------------------------------------------------------------
-- La vitrine
-- ---------------------------------------------------------------------
reset role; select tests.anonyme();
select is((select caracteristiques from public.vitrine_produits where id = tests.id('produit_a')),
  '[{"cle": "volume", "type": "nombre", "unite": "L", "valeur": "38.5", "en_carte": false, "label_ar": null, "label_fr": "Volume"},
    {"cle": "garantie", "type": "texte", "unite": null, "valeur": "5 ans", "en_carte": true, "label_ar": null, "label_fr": "Garantie"}]'::jsonb,
  'la fiche de la vitrine rend la fiche technique, dans l''ordre de la boutique');
select is((select jsonb_agg(a ->> 'cle') from jsonb_array_elements(tests.liste() -> 'facettes' -> 'axes') a), '["volume", "couleur"]'::jsonb,
  'la caractéristique filtrable devient une facette, avant les axes de variante ; la garantie (non filtrable) non');
select is((select a ->> 'unite' from jsonb_array_elements(tests.liste() -> 'facettes' -> 'axes') a where a ->> 'cle' = 'volume'), 'L',
  'la facette donne son unité');
select is(tests.liste() -> 'facettes' -> 'options' -> 'volume', '[{"valeur": "38.5", "compte": 1}, {"valeur": "100", "compte": 1}]'::jsonb,
  'les valeurs d''un nombre se trient comme des nombres (38,5 avant 100)');
select is((tests.liste('{"options": {"volume": ["100"]}}') ->> 'total')::int, 1, 'filtrer sur une caractéristique');
select is((tests.liste('{"options": {"volume": ["100"], "couleur": ["Noir"]}}') ->> 'total')::int, 1,
  'avec un axe de variante en même temps');
select is(tests.liste('{"options": {"volume": ["100"]}}') -> 'facettes' -> 'options' -> 'couleur',
  '[{"valeur": "Noir", "compte": 1}]'::jsonb, 'les comptes des axes suivent le filtre d''une caractéristique (2 sans lui)');
select is((tests.liste('{"q": "5 ans"}') ->> 'total')::int, 1, 'la recherche lit aussi les caractéristiques');

-- ---------------------------------------------------------------------
-- Ranger, changer, retirer
-- ---------------------------------------------------------------------
reset role; select tests.connecte('proprio_a');
select public.gestion_deplacer_attribut(tests.id('A'), (select id from ids where nom = 'garantie'), -1);
select is((select jsonb_agg(x ->> 'cle') from jsonb_array_elements(public.gestion_attributs(tests.id('A'))) x), '["garantie", "volume"]'::jsonb,
  'monter une caractéristique change l''ordre de la fiche');
select throws_like(format($$ select public.gestion_enregistrer_attribut(%L, %L, null, 'Garantie', null, 'nombre', false, true, '{}') $$,
  tests.id('A'), (select id from ids where nom = 'garantie')), '%pas des nombres%',
  'un texte ne devient un nombre que si toutes ses valeurs en sont');
select is(public.gestion_retirer_attribut(tests.id('A'), (select id from ids where nom = 'volume')), 2,
  'retirer une caractéristique : deux produits perdent leur valeur');
select is(tests.car('produit_a'), '{"garantie": "5 ans"}'::jsonb, 'les autres valeurs restent');

-- Une boutique suspendue ne montre pas ses caractéristiques.
reset role;
insert into public.attributs (boutique_id, cle, label_fr) values (tests.id('C'), 'secret', 'Secret');
select tests.anonyme();
select is((select count(*) from public.attributs where boutique_id = tests.id('C')), 0::bigint,
  'les caractéristiques d''une boutique suspendue ne se lisent pas');
reset role; select tests.connecte('proprio_b');
select is((select count(*) from public.attributs where boutique_id = tests.id('C')), 0::bigint, 'ni par l''équipe d''une autre');

select * from finish();
rollback;
