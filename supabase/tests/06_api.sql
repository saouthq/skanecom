-- =====================================================================
-- 06 · Fonctions de l'API et portes fermées
-- =====================================================================
begin;
\ir outils.psql

select plan(22);

-- ---------------------------------------------------------------------
-- Vitrine (visiteur anonyme)
-- ---------------------------------------------------------------------
reset role; select tests.anonyme();
select results_eq(
  $$ select slug, statut, hote_principal from public.resoudre_domaine(' WWW.Essai-A.test ') $$,
  $$ values ('essai-a'::text, 'active'::text, 'essai-a.test'::text) $$,
  'un domaine secondaire mène à sa boutique et à son domaine principal');
select is_empty($$ select * from public.resoudre_domaine('inconnu.test') $$,
  'un domaine inconnu ne mène à rien');
select is(public.frais_livraison_millimes(tests.id('A'), 'tunis'), 6000::bigint,
  'le panier d''un visiteur calcule les frais');
select isnt(public.configuration_publique(tests.id('A')), null,
  'la vitrine lit la configuration publique');

select throws_ok('select * from public.mes_acces()', '42501', null,
  'un visiteur n''appelle pas mes_acces');
select throws_ok(format('select * from public.reglages_boutique(%L)', tests.id('A')), '42501', null,
  'un visiteur n''appelle pas reglages_boutique');
select throws_ok(format($$ select public.inscrire_client(%L, 'x', 'x') $$, tests.id('A')), '42501', null,
  'un visiteur n''appelle pas inscrire_client');
select throws_ok('select * from plateforme.boutiques', '42501', null,
  'un visiteur ne lit pas plateforme.boutiques');
select throws_ok(format($$ select private.reglage(%L, 'commande.prefixe_numero') $$, tests.id('A')), '42501', null,
  'un visiteur n''appelle pas private.reglage');
select throws_ok('select * from public.annuaire_domaines()', '42501', null,
  'un visiteur ne lit pas l''annuaire des domaines (la liste de nos clients)');

-- ---------------------------------------------------------------------
-- Backoffice
-- ---------------------------------------------------------------------
reset role; select tests.connecte('multi');
select set_eq($$ select slug, role from public.mes_acces() $$,
  $$ values ('essai-a'::text, 'admin'::text), ('essai-b', 'lecture') $$,
  'mes_acces liste chaque boutique avec le rôle qu''on y a');

reset role;
select count(*) as nb_reglages from plateforme.reglages_catalogue \gset
select tests.connecte('lecture_a');
select is(
  (select count(*) from public.reglages_boutique(tests.id('A'))), :nb_reglages::bigint,
  'l''équipe voit tous les réglages de sa boutique');
select is(
  (select valeur #>> '{}' from public.reglages_boutique(tests.id('A')) where cle = 'livraison.mode_frais'), 'zone',
  'avec la valeur propre à la boutique');

reset role; select tests.connecte('proprio_b');
select is_empty(format('select * from public.reglages_boutique(%L)', tests.id('A')),
  'une autre équipe ne voit pas les réglages de A');

-- ---------------------------------------------------------------------
-- Inscription d'un acheteur
-- ---------------------------------------------------------------------
reset role; select tests.connecte('inconnu');
select public.inscrire_client(tests.id('A'), 'Nouveau client', '+21620000009') as fiche_id \gset
select is(public.inscrire_client(tests.id('A'), 'Nouveau nom', '+21620000009'), :'fiche_id'::uuid,
  'une deuxième inscription dans la même boutique met à jour la même fiche');
select throws_ok(format($$ select public.inscrire_client(%L, 'x', 'x') $$, tests.id('C')), 'P0002', null,
  'on ne devient pas client d''une boutique suspendue');
select results_eq('select nom, nb_commandes from public.clients', $$ values ('Nouveau nom'::text, 0) $$,
  'l''acheteur lit sa fiche, et seulement la sienne');

-- ---------------------------------------------------------------------
-- Mouvements de stock
-- ---------------------------------------------------------------------
reset role; select tests.connecte('proprio_a');
select throws_like(format($$ select public.mouvement_stock(%L, %L, 1, 'vente') $$, tests.id('A'), tests.id('variante_a')),
  'Le motif vente est réservé aux commandes', 'une vente ne se saisit pas à la main');
select throws_ok(format($$ select public.mouvement_stock(%L, %L, -100, 'casse') $$, tests.id('A'), tests.id('variante_a')),
  '23514', null, 'un mouvement ne fait jamais passer le stock sous zéro');
select throws_ok(format($$ select public.mouvement_stock(%L, %L, 1, 'reception') $$, tests.id('A'), tests.id('variante_b')),
  'P0002', null, 'une variante de B est introuvable depuis A');

reset role; select tests.service();
select set_eq($$ select hote, slug from public.annuaire_domaines() where slug like 'essai-%' $$,
  $$ values ('essai-a.test'::text, 'essai-a'::text), ('www.essai-a.test', 'essai-a'), ('essai-b.test', 'essai-b') $$,
  'l''annuaire donne les domaines des boutiques actives, pas ceux d''une boutique suspendue');
select is(public.mouvement_stock(tests.id('B'), tests.id('variante_b'), 10, 'correction', 'Inventaire'), 12,
  'la console (service_role) saisit un inventaire');

reset role;
select * from finish();
rollback;
