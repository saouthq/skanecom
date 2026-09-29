-- =====================================================================
-- 04 · Intégrité : ce que la base refuse, même hors RLS
-- =====================================================================
-- Ces tests tournent sous postgres, propriétaire des tables, qui contourne la
-- RLS : c'est le cas d'une fonction SECURITY DEFINER, de la console ou d'un
-- bug côté serveur. Les clés composites et les triggers doivent tenir quand même.
begin;
\ir outils.psql

select plan(17);

-- ---------------------------------------------------------------------
-- Aucune référence d'une boutique vers une autre
-- ---------------------------------------------------------------------
select throws_ok(
  format($$ insert into public.commande_lignes (boutique_id, commande_id, variante_id, produit_nom, prix_unitaire_millimes, quantite, total_ligne_millimes)
            values (%L, %L, %L, 'x', 1, 1, 1) $$, tests.id('A'), tests.id('commande_a'), tests.id('variante_b')),
  '23503', null, 'une ligne de A ne vise pas une variante de B (le stock de B ne peut pas être débité)');
select throws_ok(
  format($$ insert into public.commande_lignes (boutique_id, commande_id, produit_nom, prix_unitaire_millimes, quantite, total_ligne_millimes)
            values (%L, %L, 'x', 1, 1, 1) $$, tests.id('A'), tests.id('commande_ab_b')),
  '23503', null, 'une ligne de A ne s''accroche pas à une commande de B');
select throws_ok(
  format($$ update public.produits set categorie_id = %L where id = %L $$, tests.id('cat_b'), tests.id('produit_a')),
  '23503', null, 'un produit de A ne se range pas dans une catégorie de B');
select throws_ok(
  format($$ insert into public.adresses (boutique_id, client_id, nom_destinataire, telephone, ligne1, ville, gouvernorat_code)
            values (%L, %L, 'x', 'x', 'x', 'x', 'tunis') $$, tests.id('A'), tests.id('fiche_client_ab_b')),
  '23503', null, 'une adresse de A ne s''accroche pas à un client de B');
select throws_ok(
  format($$ update public.commandes set client_id = %L where id = %L $$, tests.id('fiche_client_ab_b'), tests.id('commande_a')),
  '23503', null, 'une commande de A ne s''attribue pas à un client de B');
select throws_ok(
  format($$ insert into public.zones_gouvernorats (boutique_id, gouvernorat_code, zone_id) values (%L, 'ariana', %L) $$,
         tests.id('A'), tests.id('zone_b')),
  '23503', null, 'un gouvernorat de A ne se rattache pas à une zone de B');
select throws_ok(
  format($$ insert into public.produit_images (boutique_id, produit_id, variante_id, chemin) values (%L, %L, %L, 'essai-a/photo.webp') $$,
         tests.id('A'), tests.id('produit_a'), tests.id('variante_b')),
  '23503', null, 'une photo de A ne s''accroche pas à une variante de B');

-- ---------------------------------------------------------------------
-- Une ligne ne change jamais de boutique
-- ---------------------------------------------------------------------
select throws_like(
  format($$ update public.categories set boutique_id = %L where id = %L $$, tests.id('B'), tests.id('cat_a_inactive')),
  'boutique_id ne change jamais%', 'une catégorie ne passe pas d''une boutique à l''autre');
select throws_like(
  format($$ update public.clients set boutique_id = %L where id = %L $$, tests.id('B'), tests.id('fiche_invite_a')),
  'boutique_id ne change jamais%', 'une fiche client ne passe pas d''une boutique à l''autre');

-- ---------------------------------------------------------------------
-- Unicités par boutique
-- ---------------------------------------------------------------------
select is((select count(*) from public.produits where slug = 'valise-cabine'), 2::bigint,
  'deux boutiques peuvent avoir chacune un produit « valise-cabine »');
select is((select count(*) from public.variantes where sku = 'VAL-55-NOIR'), 2::bigint,
  'deux boutiques peuvent avoir chacune le SKU « VAL-55-NOIR »');
select throws_ok(
  format($$ insert into public.produits (boutique_id, slug, nom_fr) values (%L, 'valise-cabine', 'Doublon') $$, tests.id('A')),
  '23505', null, 'mais pas deux fois le même slug dans une boutique');
select throws_ok(
  format($$ insert into public.variantes (boutique_id, produit_id, sku, prix_millimes, options) values (%L, %L, 'VAL-55-NOIR', 1, '{"couleur": "Bleu"}') $$,
         tests.id('A'), tests.id('produit_a')),
  '23505', null, 'ni deux fois le même SKU dans une boutique');

-- ---------------------------------------------------------------------
-- Le stock ne change que par un mouvement, même hors RLS
-- ---------------------------------------------------------------------
select throws_like(
  format($$ update public.variantes set stock = 50 where id = %L $$, tests.id('variante_a')),
  '%ne change que par un mouvement de stock%', 'même hors RLS, personne ne modifie le stock en direct');
select is(
  (select sum(delta) from public.stock_mouvements where variante_id = tests.id('variante_a'))::integer,
  (select stock from public.variantes where id = tests.id('variante_a')),
  'le stock de la variante est exactement la somme de son journal');

-- ---------------------------------------------------------------------
-- Suppressions : on n'emporte que ce qui doit l'être
-- ---------------------------------------------------------------------
delete from public.categories where id = tests.id('cat_a');
select is(
  (select row(boutique_id, categorie_id)::text from public.produits where id = tests.id('produit_a')),
  row(tests.id('A'), null::uuid)::text,
  'supprimer une catégorie laisse ses produits dans la boutique, non classés');

delete from public.variantes where id = tests.id('variante_b');
select is(
  (select row(boutique_id, variante_id, produit_nom)::text from public.commande_lignes where commande_id = tests.id('commande_ab_b')),
  row(tests.id('B'), null::uuid, 'Valise cabine B')::text,
  'supprimer une variante garde la ligne de commande lisible, dans sa boutique');

select * from finish();
rollback;
