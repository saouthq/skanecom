-- =====================================================================
-- 03 · Rôles dans une boutique
-- =====================================================================
--   lecture      lit tout, n'écrit rien
--   preparateur  expédie les commandes, saisit les mouvements de stock
--   confirmateur confirme les commandes, gère les fiches clients
--   admin / proprietaire : catalogue, stock, zones, réglages
-- Et pour tous : le stock, le journal et l'historique ne s'écrivent que par
-- les fonctions de la base ; une commande ne se crée que côté serveur.
begin;
\ir outils.psql

select plan(22);

-- ---------------------------------------------------------------------
-- lecture
-- ---------------------------------------------------------------------
reset role; select tests.connecte('lecture_a');
select is((select count(*) from public.commandes), 2::bigint, 'lecture lit les commandes de sa boutique');
select throws_ok(
  format($$ insert into public.produits (boutique_id, slug, nom_fr) values (%L, 'x', 'x') $$, tests.id('A')),
  '42501', null, 'lecture ne crée pas de produit');
update public.produits  set nom_fr = 'modifié par lecture' where boutique_id = tests.id('A');
update public.commandes set statut = 'confirmee'           where boutique_id = tests.id('A');
select throws_ok(
  format($$ select public.mouvement_stock(%L, %L, 1, 'reception') $$, tests.id('A'), tests.id('variante_a')),
  '42501', null, 'lecture ne saisit pas de mouvement de stock');

reset role;
select is((select count(*) from public.produits where nom_fr = 'modifié par lecture'), 0::bigint,
  'lecture ne modifie pas le catalogue');
select is((select count(*) from public.commandes where boutique_id = tests.id('A') and statut = 'confirmee'), 0::bigint,
  'lecture ne fait pas avancer les commandes');

-- ---------------------------------------------------------------------
-- préparateur
-- ---------------------------------------------------------------------
reset role; select tests.connecte('prepa_a');
update public.commandes set statut = 'confirmee' where id = tests.id('commande_a');
update public.produits  set nom_fr = 'modifié par prépa' where boutique_id = tests.id('A');
update public.clients   set note_interne = 'note du prépa' where boutique_id = tests.id('A');
select is(public.mouvement_stock(tests.id('A'), tests.id('variante_a'), 3, 'reception', 'Arrivage'), 6,
  'le préparateur saisit une réception : 5 au départ, 2 réservés par les commandes, 3 reçus');
select throws_ok(
  format($$ select public.mouvement_stock(%L, %L, 1, 'reception') $$, tests.id('B'), tests.id('variante_b')),
  '42501', null, 'le préparateur de A ne saisit pas de mouvement dans B');

reset role;
select is((select statut::text from public.commandes where id = tests.id('commande_a')), 'recue',
  'une commande n''avance plus par un UPDATE direct, même par l''équipe : elle passe par les fonctions de gestion');
update public.commandes set statut = 'confirmee' where id = tests.id('commande_a');
select tests.connecte('prepa_a');
select lives_ok(
  format($$ select public.gestion_expedier(%L, %L, 'confirmee') $$, tests.id('A'),
         (select numero from public.commandes where id = tests.id('commande_a'))),
  'le préparateur expédie une commande confirmée');
reset role;
select is((select count(*) from public.produits where nom_fr = 'modifié par prépa'), 0::bigint,
  'le préparateur ne modifie pas le catalogue');
select is((select count(*) from public.clients where note_interne = 'note du prépa'), 0::bigint,
  'le préparateur ne modifie pas les fiches clients');

-- ---------------------------------------------------------------------
-- confirmateur
-- ---------------------------------------------------------------------
reset role; select tests.connecte('confirm_a');
update public.clients set nb_refus = 0, niveau_risque = 'bloque' where id = tests.id('fiche_invite_a');
select public.gestion_confiance_client(tests.id('A'), tests.id('fiche_invite_a'), 'surveille', 'Deux appels sans réponse');
select throws_ok(
  format($$ select public.mouvement_stock(%L, %L, 1, 'reception') $$, tests.id('A'), tests.id('variante_a')),
  '42501', null, 'le confirmateur ne saisit pas de mouvement de stock');

reset role;
select is((select niveau_risque from public.clients where id = tests.id('fiche_invite_a')), 'surveille',
  'le confirmateur gère les fiches clients, par la fonction de gestion (un UPDATE direct ne passe plus)');

-- ---------------------------------------------------------------------
-- propriétaire
-- ---------------------------------------------------------------------
reset role; select tests.connecte('proprio_a');
select lives_ok(
  format($$ insert into public.reglages (boutique_id, cle, valeur) values (%L, 'livraison.frais_fixes_millimes', '8000') $$, tests.id('A')),
  'le propriétaire règle sa boutique');
select lives_ok(
  format($$ update public.produits set publie = false where id = %L $$, tests.id('produit_a')),
  'le propriétaire modifie son catalogue');

-- Ce qu'aucun rôle ne fait, même le propriétaire
select throws_like(
  format($$ update public.variantes set stock = 99 where id = %L $$, tests.id('variante_a')),
  '%ne change que par un mouvement de stock%',
  'personne ne modifie le stock en direct, même le propriétaire');
select throws_ok(
  format($$ insert into public.stock_mouvements (boutique_id, variante_id, delta, stock_apres, motif)
            values (%L, %L, 1, 1, 'correction') $$, tests.id('A'), tests.id('variante_a')),
  '42501', null, 'personne n''écrit le journal de stock en direct');
select throws_ok(
  format($$ insert into public.commandes (boutique_id, contact_nom, contact_telephone, livraison_ligne1, livraison_ville, livraison_gouvernorat)
            values (%L, 'x', 'x', 'x', 'x', 'tunis') $$, tests.id('A')),
  '42501', null, 'une commande ne se crée pas par l''API, même par le propriétaire');
select throws_ok(
  format($$ insert into public.commande_lignes (boutique_id, commande_id, produit_nom, prix_unitaire_millimes, quantite, total_ligne_millimes)
            values (%L, %L, 'x', 0, 1, 0) $$, tests.id('A'), tests.id('commande_a')),
  '42501', null, 'une ligne de commande ne s''ajoute pas par l''API');
update public.commande_evenements set commentaire = 'réécrit' where boutique_id = tests.id('A');
delete from public.commande_evenements where boutique_id = tests.id('A');

reset role;
select is((select count(*) from public.commande_evenements where commentaire = 'réécrit'), 0::bigint,
  'l''historique des commandes ne se réécrit pas');
select ok((select count(*) from public.commande_evenements where boutique_id = tests.id('A')) >= 2,
  'l''historique des commandes ne se supprime pas');

-- ---------------------------------------------------------------------
-- Administrateur de la plateforme : aucun droit par la RLS
-- ---------------------------------------------------------------------
reset role; select tests.connecte('admin_plateforme');
select is((select count(*) from public.commandes), 0::bigint,
  'un administrateur de la plateforme ne lit rien par l''API : il passe par la console, qui trace');

reset role;
select * from finish();
rollback;
