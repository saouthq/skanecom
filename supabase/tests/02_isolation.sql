-- =====================================================================
-- 02 · Isolation entre boutiques
-- =====================================================================
-- La règle n°1 : l'équipe d'une boutique ne voit et ne modifie jamais les
-- données d'une autre. Pour chaque table de boutique, on compare ce qu'un
-- membre de A voit de B avec ce qu'un visiteur anonyme en voit : être membre
-- de A ne doit RIEN donner de plus sur B.
begin;
\ir outils.psql

select plan(24);

-- ---------------------------------------------------------------------
-- Relevés : qui voit combien de lignes de quelle boutique
-- ---------------------------------------------------------------------
reset role; select tests.anonyme();
insert into tests.vus select 'anon/A', * from tests.lignes_visibles(tests.id('A'));
insert into tests.vus select 'anon/B', * from tests.lignes_visibles(tests.id('B'));

reset role; select tests.connecte('inconnu');
insert into tests.vus select 'inconnu/A', * from tests.lignes_visibles(tests.id('A'));
insert into tests.vus select 'inconnu/B', * from tests.lignes_visibles(tests.id('B'));

reset role; select tests.connecte('proprio_a');
insert into tests.vus select 'proprio_a/A', * from tests.lignes_visibles(tests.id('A'));
insert into tests.vus select 'proprio_a/B', * from tests.lignes_visibles(tests.id('B'));

reset role; select tests.connecte('proprio_b');
insert into tests.vus select 'proprio_b/A', * from tests.lignes_visibles(tests.id('A'));
insert into tests.vus select 'proprio_b/B', * from tests.lignes_visibles(tests.id('B'));

reset role; select tests.connecte('multi');
insert into tests.vus select 'multi/B', * from tests.lignes_visibles(tests.id('B'));

reset role; select tests.connecte('client_a');
insert into tests.vus select 'client_a/B', * from tests.lignes_visibles(tests.id('B'));

reset role;
create temp view ecarts as
  select a.qui as reference, b.qui as compare, a.nom_table, a.n as n_reference, b.n as n_compare
  from tests.vus a join tests.vus b using (nom_table);

select is_empty($$ select nom_table from ecarts where reference = 'anon/B' and compare = 'proprio_a/B' and n_reference <> n_compare $$,
  'le propriétaire de A ne voit de B que ce qu''un visiteur anonyme en voit, table par table');
select is_empty($$ select nom_table from ecarts where reference = 'anon/A' and compare = 'proprio_b/A' and n_reference <> n_compare $$,
  'le propriétaire de B ne voit de A que ce qu''un visiteur anonyme en voit, table par table');
select is_empty($$ select nom_table from ecarts where reference = 'anon/A' and compare = 'inconnu/A' and n_reference <> n_compare $$,
  'un compte sans rôle voit A comme un visiteur anonyme');
select is_empty($$ select nom_table from ecarts where reference = 'anon/B' and compare = 'client_a/B' and n_reference <> n_compare $$,
  'un client de A voit B comme un visiteur anonyme');

-- Les relevés ne sont pas vides : sans ça, les comparaisons ci-dessus
-- pourraient passer pour de mauvaises raisons.
select ok((select n from tests.vus where qui = 'proprio_a/A' and nom_table = 'commandes') = 2
      and (select n from tests.vus where qui = 'proprio_a/A' and nom_table = 'stock_mouvements') > 0
      and (select n from tests.vus where qui = 'proprio_a/A' and nom_table = 'reglages') = 2,
  'le propriétaire de A voit bien les commandes, le stock et les réglages de A');
select ok((select n from tests.vus where qui = 'proprio_b/B' and nom_table = 'commandes') = 1
      and (select n from tests.vus where qui = 'proprio_b/B' and nom_table = 'clients') = 1,
  'le propriétaire de B voit bien les commandes et les clients de B');
select is((select n from tests.vus where qui = 'multi/B' and nom_table = 'commandes'), 1::bigint,
  'multi (lecture dans B) lit les commandes de B');

-- Rien de privé ne sort vers un visiteur.
select is_empty($$
  select nom_table from tests.vus
  where qui in ('anon/A', 'anon/B')
    and nom_table in ('reglages', 'stock_mouvements', 'clients', 'adresses', 'commandes',
                      'commande_lignes', 'commande_evenements', 'compteurs_commandes')
    and n > 0
$$, 'un visiteur ne voit ni réglages, ni stock, ni clients, ni adresses, ni commandes');


-- ---------------------------------------------------------------------
-- Écritures vers une autre boutique
-- ---------------------------------------------------------------------
reset role; select tests.connecte('proprio_a');

select throws_ok(
  format($$ insert into public.produits (boutique_id, slug, nom_fr) values (%L, 'intrus', 'Intrus') $$, tests.id('B')),
  '42501', null, 'le propriétaire de A ne crée pas de produit dans B');
select throws_ok(
  format($$ insert into public.reglages (boutique_id, cle, valeur) values (%L, 'livraison.frais_fixes_millimes', '1') $$, tests.id('B')),
  '42501', null, 'le propriétaire de A ne règle pas B');
select throws_ok(
  format($$ insert into public.zones_livraison (boutique_id, nom_fr) values (%L, 'Intrus') $$, tests.id('B')),
  '42501', null, 'le propriétaire de A ne crée pas de zone dans B');

update public.produits  set nom_fr = 'piraté'  where boutique_id = tests.id('B');
update public.variantes set prix_millimes = 1  where boutique_id = tests.id('B');
update public.commandes set note_interne = 'piraté' where boutique_id = tests.id('B');
update public.clients   set note_interne = 'piraté' where boutique_id = tests.id('B');
delete from public.produits   where boutique_id = tests.id('B');
delete from public.categories where boutique_id = tests.id('B');
delete from public.reglages   where boutique_id = tests.id('B');

reset role;
select is((select count(*) from public.produits where nom_fr = 'piraté'), 0::bigint,
  'le propriétaire de A ne modifie pas les produits de B');
select is((select count(*) from public.variantes where boutique_id = tests.id('B') and prix_millimes = 1), 0::bigint,
  'le propriétaire de A ne modifie pas les prix de B');
select is((select count(*) from public.commandes where note_interne = 'piraté'), 0::bigint,
  'le propriétaire de A ne modifie pas les commandes de B');
select is((select count(*) from public.clients where note_interne = 'piraté'), 0::bigint,
  'le propriétaire de A ne modifie pas les clients de B');
select is((select count(*) from public.produits where boutique_id = tests.id('B')), 1::bigint,
  'le propriétaire de A ne supprime pas les produits de B');
select is((select count(*) from public.reglages where boutique_id = tests.id('B')), 1::bigint,
  'le propriétaire de A ne supprime pas les réglages de B');

-- multi est admin dans A et lecture dans B : le rôle vaut boutique par boutique.
reset role; select tests.connecte('multi');
select lives_ok(
  format($$ insert into public.produits (boutique_id, slug, nom_fr) values (%L, 'nouveau-a', 'Nouveau') $$, tests.id('A')),
  'multi (admin dans A) crée un produit dans A');
select throws_ok(
  format($$ insert into public.produits (boutique_id, slug, nom_fr) values (%L, 'nouveau-b', 'Nouveau') $$, tests.id('B')),
  '42501', null, 'multi (lecture dans B) ne crée pas de produit dans B');


-- ---------------------------------------------------------------------
-- Clients : chacun ne voit que ce qui est à lui
-- ---------------------------------------------------------------------
reset role; select tests.connecte('client_a');
select results_eq('select id from public.commandes', format('select %L::uuid', tests.id('commande_a')),
  'client_a ne voit que sa commande');
select results_eq('select id from public.clients', format('select %L::uuid', tests.id('fiche_client_a')),
  'client_a ne voit que sa fiche client');
select throws_ok(
  format($$ insert into public.adresses (boutique_id, client_id, nom_destinataire, telephone, ligne1, ville, gouvernorat_code)
            values (%L, %L, 'x', 'x', 'x', 'x', 'tunis') $$, tests.id('A'), tests.id('fiche_client_ab_a')),
  '42501', null, 'client_a n''ajoute pas d''adresse sur la fiche d''un autre client');

reset role; select tests.connecte('client_ab');
select set_eq('select id from public.commandes',
  format('select unnest(array[%L, %L]::uuid[])', tests.id('commande_ab_a'), tests.id('commande_ab_b')),
  'client_ab voit ses commandes dans A et dans B, et seulement elles');
select is((select count(*) from public.commande_lignes), 2::bigint,
  'client_ab voit les lignes de ses deux commandes, et seulement elles');

select * from finish();
rollback;
