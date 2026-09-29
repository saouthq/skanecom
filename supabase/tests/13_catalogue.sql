-- =====================================================================
-- 13 · Le catalogue au backoffice : lire, modifier, tenir le stock
-- =====================================================================
begin;
\ir outils.psql

select plan(39);

-- Jeu d'essai (outils.psql) : produit_a (publié, axe couleur : Noir actif
-- en stock 5, Or inactif), produit_a_brouillon (sans axe, 1 déclinaison) ;
-- produit_b dans la boutique B.

-- ---------------------------------------------------------------------
-- Portes
-- ---------------------------------------------------------------------
reset role; select tests.anonyme();
select throws_ok(format($$ select public.gestion_liste_produits(%L) $$, tests.id('A')),
  '42501', null, 'un visiteur ne lit pas le catalogue du backoffice');
reset role; select tests.connecte('inconnu');
select throws_ok(format($$ select public.gestion_liste_produits(%L) $$, tests.id('A')),
  '42501', null, 'un compte sans rôle non plus');
reset role; select tests.connecte('proprio_b');
select throws_ok(format($$ select public.gestion_liste_produits(%L) $$, tests.id('A')),
  '42501', null, 'le propriétaire de B ne lit pas le catalogue de A');

-- ---------------------------------------------------------------------
-- Lire (toute l'équipe)
-- ---------------------------------------------------------------------
reset role; select tests.connecte('lecture_a');
select is((public.gestion_liste_produits(tests.id('A')) ->> 'total')::int, 2, 'la lecture voit les deux produits de A');
select is(public.gestion_liste_produits(tests.id('A')) -> 'compteurs',
  '{"tous": 2, "publies": 1, "brouillons": 1, "stock_bas": 1, "rupture": 0}'::jsonb, 'avec les compteurs de chaque filtre (le brouillon est sous son seuil)');
select is((public.gestion_liste_produits(tests.id('A'), 'brouillons') -> 'produits' -> 0 ->> 'nom'), 'Brouillon', 'le filtre « brouillons »');
select is((public.gestion_liste_produits(tests.id('A'), 'tous', 'val-55') ->> 'total')::int, 1, 'la recherche trouve par référence');
select is((public.gestion_liste_produits(tests.id('A'), 'tous', 'val-55') -> 'produits' -> 0 ->> 'stock_total')::int, 3,
  'le stock total ne compte que les déclinaisons actives');
select throws_ok(format($$ select public.gestion_liste_produits(%L, 'n_importe_quoi') $$, tests.id('A')),
  '23514', null, 'un filtre inconnu est refusé');

select is(jsonb_array_length(public.gestion_produit(tests.id('A'), tests.id('produit_a')) -> 'variantes'), 2,
  'la fiche montre toutes les déclinaisons, inactives comprises');
select is(public.gestion_produit(tests.id('A'), tests.id('produit_a')) -> 'axes' -> 0 ->> 'cle', 'couleur', 'et ses axes');
select is(public.gestion_produit(tests.id('A'), tests.id('produit_b')), null,
  'le produit d''une autre boutique n''existe pas pour A (même avec son identifiant)');

-- ---------------------------------------------------------------------
-- Modifier la fiche (propriétaire, admin)
-- ---------------------------------------------------------------------
select throws_ok(format($$ select public.gestion_enregistrer_produit(%L, %L, null, '{"nom": "Pirate"}') $$, tests.id('A'), tests.id('produit_a')),
  '42501', null, 'la lecture seule ne modifie rien');
reset role; select tests.connecte('confirm_a');
select throws_ok(format($$ select public.gestion_enregistrer_produit(%L, %L, null, '{"nom": "Pirate"}') $$, tests.id('A'), tests.id('produit_a')),
  '42501', null, 'la confirmation des commandes non plus');

reset role; select tests.connecte('proprio_a');
create temporary table version as select (public.gestion_produit(tests.id('A'), tests.id('produit_a')) ->> 'version')::timestamptz as v;
grant select on version to authenticated;
select isnt(public.gestion_enregistrer_produit(tests.id('A'), tests.id('produit_a'), (select v from version),
  '{"nom": " Valise cabine 55 cm ", "description": "Coque ABS.", "marque": "Maymar", "publie": true, "mis_en_avant": true}'),
  null, 'le propriétaire enregistre la fiche');
select results_eq(format($$ select nom_fr, marque, mis_en_avant from public.produits where id = %L $$, tests.id('produit_a')),
  $$ values ('Valise cabine 55 cm'::text, 'Maymar'::text, true) $$, 'les champs sont écrits, nettoyés');
-- (dans une même transaction, updated_at ne bouge pas : on présente une version plus ancienne)
select throws_like(format($$ select public.gestion_enregistrer_produit(%L, %L, %L, '{"nom": "Écrasement"}') $$,
                          tests.id('A'), tests.id('produit_a'), (select v - interval '1 second' from version)),
  '%modifiée entre-temps%', 'une fiche modifiée entre-temps n''est pas écrasée à l''aveugle');
select throws_like(format($$ select public.gestion_enregistrer_produit(%L, %L, null, '{"nom": "   "}') $$, tests.id('A'), tests.id('produit_a')),
  '%nom est obligatoire%', 'le nom est obligatoire');

-- ---------------------------------------------------------------------
-- Déclinaisons : prix, activité
-- ---------------------------------------------------------------------
select throws_like(format($$ select public.gestion_enregistrer_variante(%L, %L, 189000, 150000, 2, true) $$, tests.id('A'), tests.id('variante_a')),
  '%prix barré doit être supérieur%', 'un prix barré plus bas que le prix est refusé');
select lives_ok(format($$ select public.gestion_enregistrer_variante(%L, %L, 199000, 249000, 3, true) $$, tests.id('A'), tests.id('variante_a')),
  'le propriétaire change un prix et pose un prix barré');
select is((select prix_min_millimes from public.produits where id = tests.id('produit_a')), 199000::bigint,
  'le prix « à partir de » suit');
select throws_like(format($$ select public.gestion_enregistrer_variante(%L, %L, 199000, null, 3, false) $$, tests.id('A'), tests.id('variante_a')),
  '%dernière déclinaison en vente%', 'la dernière déclinaison en vente d''un produit publié ne se désactive pas');

select lives_ok(format($$ select public.gestion_enregistrer_variante(%L, %L, 1000, null, 2, false) $$, tests.id('A'), tests.id('variante_a_brouillon')),
  'un brouillon peut perdre sa seule déclinaison');
select throws_like(format($$ select public.gestion_enregistrer_produit(%L, %L, null, '{"nom": "Brouillon", "publie": true}') $$,
                          tests.id('A'), tests.id('produit_a_brouillon')),
  '%ne peut pas être publié%', 'mais il ne se publie pas sans déclinaison en vente');

-- ---------------------------------------------------------------------
-- Le stock : réception, inventaire, casse (propriétaire, admin, préparation)
-- ---------------------------------------------------------------------
reset role; select tests.connecte('confirm_a');
select throws_ok(format($$ select public.gestion_mouvement_stock(%L, %L, 'reception', 3) $$, tests.id('A'), tests.id('variante_a')),
  '42501', null, 'la confirmation des commandes ne touche pas au stock');
reset role; select tests.connecte('prepa_a');
-- (stock de variante_a : 5 au départ, 2 réservés par les commandes du jeu d'essai)
select is(public.gestion_mouvement_stock(tests.id('A'), tests.id('variante_a'), 'reception', 10, 'Arrivage Sfax'), 13,
  'la préparation reçoit 10 pièces : 13 en stock');
select results_eq(format($$ select delta, stock_apres, motif::text, commentaire, auteur_id from public.stock_mouvements
                            where variante_id = %L order by created_at desc limit 1 $$, tests.id('variante_a')),
  format($$ values (10, 13, 'reception'::text, 'Arrivage Sfax'::text, %L::uuid) $$, tests.id('prepa_a')),
  'la réception entre au journal, avec son auteur');
select is(public.gestion_mouvement_stock(tests.id('A'), tests.id('variante_a'), 'inventaire', 12), 12, 'l''inventaire ramène le stock à 12');
select is((select motif::text || ' ' || delta from public.stock_mouvements where variante_id = tests.id('variante_a') order by created_at desc limit 1),
  'correction -1', 'en écart d''inventaire (−1)');
select is(public.gestion_mouvement_stock(tests.id('A'), tests.id('variante_a'), 'inventaire', 12), 12, 'un inventaire juste');
select is((select count(*)::int from public.stock_mouvements where variante_id = tests.id('variante_a')), 5,
  'n''écrit rien de plus (stock initial, deux ventes, réception, correction)');
select throws_like(format($$ select public.gestion_mouvement_stock(%L, %L, 'casse', 20) $$, tests.id('A'), tests.id('variante_a')),
  '%ne reste que 12%', 'une casse plus grande que le stock est refusée');
select throws_ok(format($$ select public.gestion_mouvement_stock(%L, %L, 'reception', 5) $$, tests.id('A'), tests.id('variante_b')),
  'P0002', null, 'la variante d''une autre boutique est introuvable depuis A');

-- ---------------------------------------------------------------------
-- Une déclinaison de plus, un produit neuf
-- ---------------------------------------------------------------------
reset role; select tests.connecte('proprio_a');
select throws_like(format($$ select public.gestion_ajouter_variante(%L, %L, '{"couleur": "Noir"}', 'VAL-55-N2', 189000) $$, tests.id('A'), tests.id('produit_a')),
  '%existe déjà%', 'une combinaison déjà vendue est refusée');
select throws_like(format($$ select public.gestion_ajouter_variante(%L, %L, '{"couleur": "Bleu"}', 'VAL-55-NOIR', 189000) $$, tests.id('A'), tests.id('produit_a')),
  '%référence VAL-55-NOIR existe déjà%', 'une référence déjà prise aussi');
select isnt(public.gestion_ajouter_variante(tests.id('A'), tests.id('produit_a'), '{"couleur": " Bleu nuit "}', 'val-55-bleu', 189000), null,
  'le propriétaire ajoute la couleur Bleu nuit');
select results_eq(format($$ select sku, options ->> 'couleur', stock from public.variantes where produit_id = %L and sku = 'VAL-55-BLEU' $$, tests.id('produit_a')),
  $$ values ('VAL-55-BLEU'::text, 'Bleu nuit'::text, 0) $$, 'référence en capitales, valeur nettoyée, sans stock');

select is(public.gestion_creer_produit(tests.id('A'), 'Valise cabine', 'valise-cabine', tests.id('cat_a'), 159000,
  '[{"cle": "taille", "label": "Taille"}, {"cle": "couleur", "label": "Couleur"}]',
  '[{"options": {"taille": "S", "couleur": "Noir"}, "sku": "VC-S-NOIR"}, {"options": {"taille": "M", "couleur": "Noir"}, "sku": "VC-M-NOIR"}]') ->> 'slug',
  'valise-cabine-2', 'un produit neuf prend une adresse libre');
select results_eq($$ select p.publie, p.prix_min_millimes, (select count(*)::int from public.variantes v where v.produit_id = p.id)
                     from public.produits p where p.slug = 'valise-cabine-2' $$,
  $$ values (false, 159000::bigint, 2) $$, 'il naît en brouillon, avec ses deux déclinaisons');

select * from finish();
rollback;
