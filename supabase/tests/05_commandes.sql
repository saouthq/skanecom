-- =====================================================================
-- 05 · Commandes, stock, frais et réglages : le comportement repris de
-- Maymar, maintenant boutique par boutique
-- =====================================================================
begin;
\ir outils.psql

select plan(29);

create temp view annee as
  select extract(year from now() at time zone 'Africa/Tunis')::int::text as a;

-- ---------------------------------------------------------------------
-- Numérotation par boutique
-- ---------------------------------------------------------------------
select set_eq(
  format('select numero from public.commandes where boutique_id = %L', tests.id('A')),
  $$ select unnest(array['MAY-' || a || '-00001', 'MAY-' || a || '-00002']) from annee $$,
  'A numérote ses commandes avec son préfixe et son propre compteur');
select is((select numero from public.commandes where id = tests.id('commande_ab_b')),
  (select 'QSF-' || a || '-00001' from annee),
  'B a son propre compteur : sa première commande est la n°1');

insert into public.commandes (id, boutique_id, contact_nom, contact_telephone, livraison_ligne1, livraison_ville, livraison_gouvernorat)
values (tests.nouvel_id('commande_c'), tests.id('C'), 'x', 'x', 'x', 'x', 'tunis');
select is((select numero from public.commandes where id = tests.id('commande_c')),
  (select 'ESS-' || a || '-00001' from annee),
  'sans préfixe réglé, la boutique prend les trois premières lettres de son identifiant');

-- ---------------------------------------------------------------------
-- Idempotence
-- ---------------------------------------------------------------------
insert into public.commandes (boutique_id, cle_idempotence, contact_nom, contact_telephone, livraison_ligne1, livraison_ville, livraison_gouvernorat)
values (tests.id('A'), 'panier-123', 'x', 'x', 'x', 'x', 'tunis');
select throws_ok(
  format($$ insert into public.commandes (boutique_id, cle_idempotence, contact_nom, contact_telephone, livraison_ligne1, livraison_ville, livraison_gouvernorat)
            values (%L, 'panier-123', 'x', 'x', 'x', 'x', 'tunis') $$, tests.id('A')),
  '23505', null, 'une commande envoyée deux fois n''est créée qu''une fois');
select lives_ok(
  format($$ insert into public.commandes (boutique_id, cle_idempotence, contact_nom, contact_telephone, livraison_ligne1, livraison_ville, livraison_gouvernorat)
            values (%L, 'panier-123', 'x', 'x', 'x', 'x', 'sfax') $$, tests.id('B')),
  'la même clé dans une autre boutique est une autre commande');

-- ---------------------------------------------------------------------
-- Réservation du stock
-- ---------------------------------------------------------------------
select is((select stock from public.variantes where id = tests.id('variante_a')), 3,
  'les deux lignes du jeu d''essai ont réservé 2 pièces sur 5');

insert into public.commande_lignes (boutique_id, commande_id, variante_id, produit_nom, prix_unitaire_millimes, quantite, total_ligne_millimes)
values (tests.id('A'), tests.id('commande_a'), tests.id('variante_a'), 'Valise cabine', 189000, 2, 378000);
select is((select stock from public.variantes where id = tests.id('variante_a')), 1,
  'une ligne de 2 pièces réserve 2 pièces');
select is((select stock from public.variantes where id = tests.id('variante_b')), 2,
  'le stock de B n''a pas bougé (3 moins sa propre commande)');
select throws_like(
  format($$ insert into public.commande_lignes (boutique_id, commande_id, variante_id, produit_nom, prix_unitaire_millimes, quantite, total_ligne_millimes)
            values (%L, %L, %L, 'Valise cabine', 189000, 5, 945000) $$, tests.id('A'), tests.id('commande_ab_a'), tests.id('variante_a')),
  'Stock insuffisant%', 'on ne vend pas ce qu''on n''a pas');

-- ---------------------------------------------------------------------
-- Refus à la livraison
-- ---------------------------------------------------------------------
select throws_ok(
  format($$ update public.commandes set statut = 'refusee' where id = %L $$, tests.id('commande_a')),
  '23514', null, 'un refus sans origine est interdit');

update public.commandes set statut = 'confirmee' where id = tests.id('commande_a');
select isnt((select confirmee_at from public.commandes where id = tests.id('commande_a')), null,
  'la confirmation est horodatée par la base');

update public.commandes set statut = 'refusee', refus_origine = 'client', refus_commentaire = 'Absent'
 where id = tests.id('commande_a');
select is((select stock from public.variantes where id = tests.id('variante_a')), 4,
  'le refus remet les 3 pièces de la commande en stock');
select is((select count(*) from public.stock_mouvements where commande_id = tests.id('commande_a') and motif = 'retour_refus'), 2::bigint,
  'chaque ligne rendue entre au journal avec le motif retour_refus');
select results_eq(
  format($$ select statut_avant::text, statut_apres::text, origine_refus::text from public.commande_evenements
            where commande_id = %L order by created_at $$, tests.id('commande_a')),
  $$ values (null::text, 'recue'::text, null::text), ('recue', 'confirmee', null), ('confirmee', 'refusee', 'client') $$,
  'l''historique trace chaque étape et l''origine du refus');
select isnt((select cloturee_at from public.commandes where id = tests.id('commande_a')), null,
  'la commande refusée est clôturée');
select is((select row(nb_commandes, nb_refus)::text from public.clients where id = tests.id('fiche_client_a')), '(1,1)',
  'la fiche client compte la commande et le refus');

update public.commandes set statut = 'recue' where id = tests.id('commande_a');
update public.commandes set statut = 'annulee', motif_annulation = 'Rouverte puis annulée' where id = tests.id('commande_a');
select is((select stock from public.variantes where id = tests.id('variante_a')), 4,
  'une commande rouverte puis annulée ne rend pas son stock deux fois');

update public.commandes set statut = 'refusee', refus_origine = 'livreur' where id = tests.id('commande_ab_a');
select is((select nb_refus from public.clients where id = tests.id('fiche_client_ab_a')), 0,
  'un refus du livreur ne compte pas contre le client');

-- ---------------------------------------------------------------------
-- Frais de livraison, boutique par boutique
-- ---------------------------------------------------------------------
select is(public.frais_livraison_millimes(tests.id('A'), 'tunis'), 6000::bigint,
  'A est en frais par zone : Tunis paie le tarif de sa zone');
select is(public.frais_livraison_millimes(tests.id('A'), 'kebili'), 7000::bigint,
  'un gouvernorat sans zone retombe sur le tarif fixe, jamais sur zéro');
select is(public.frais_livraison_millimes(tests.id('B'), 'sfax'), 7000::bigint,
  'B est en frais fixes (défaut) : sa zone Sfax ne s''applique pas');

insert into public.reglages (boutique_id, cle, valeur) values (tests.id('A'), 'livraison.seuil_gratuite_millimes', '500000');
select is(public.frais_livraison_millimes(tests.id('A'), 'tunis', 600000), 0::bigint,
  'au-dessus du seuil de gratuité, la livraison est offerte');
select is(public.frais_livraison_millimes(tests.id('A'), 'tunis', 100000), 6000::bigint,
  'en dessous, le tarif de la zone s''applique');

-- ---------------------------------------------------------------------
-- Réglages : valeurs typées, et ce que la vitrine en voit
-- ---------------------------------------------------------------------
select throws_like(
  format($$ insert into public.reglages (boutique_id, cle, valeur) values (%L, 'livraison.mode_frais', '"gratuit"') $$, tests.id('B')),
  'Valeur invalide%', 'un choix hors de la liste est refusé');
select throws_like(
  format($$ insert into public.reglages (boutique_id, cle, valeur) values (%L, 'compte.obligatoire', '"oui"') $$, tests.id('B')),
  'Valeur invalide%', 'un booléen écrit en texte est refusé');
select throws_ok(
  format($$ insert into public.reglages (boutique_id, cle, valeur) values (%L, 'reglage.inexistant', 'true') $$, tests.id('B')),
  '23503', null, 'un réglage absent du catalogue est refusé');

select ok(
  (public.configuration_publique(tests.id('A')) -> 'reglages' ->> 'livraison.mode_frais') = 'zone'
  and not (public.configuration_publique(tests.id('A')) -> 'reglages') ? 'commande.prefixe_numero'
  and not (public.configuration_publique(tests.id('A')) -> 'reglages') ? 'paiement.konnect_actif',
  'la vitrine lit les réglages publics effectifs, ni les internes, ni ceux d''un module inactif');

insert into plateforme.modules_actifs (boutique_id, module) values (tests.id('A'), 'paiement_en_ligne');
select ok(
  (public.configuration_publique(tests.id('A')) -> 'reglages') ? 'paiement.konnect_actif'
  and (public.configuration_publique(tests.id('A')) -> 'modules') = '["paiement_en_ligne"]'::jsonb,
  'un module activé apporte ses réglages à la vitrine');

select is(public.configuration_publique(tests.id('C')), null,
  'une boutique suspendue n''a pas de configuration publique');

select * from finish();
rollback;
