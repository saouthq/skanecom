-- =====================================================================
-- 44 · Le poste de pilotage de la console : chaque boutique d'un coup d'œil
-- =====================================================================
begin;
\ir outils.psql

select plan(17);

-- La ligne d'une boutique du jeu d'essai (la base porte aussi le jeu de démo).
create function pg_temp.ligne(p_nom text) returns jsonb language sql as $$
  select l from jsonb_array_elements(public.console_pilotage()) l where (l ->> 'id')::uuid = tests.id(p_nom)
$$;

-- ---------------------------------------------------------------------
-- Portes : la clé service_role seulement
-- ---------------------------------------------------------------------
reset role; select tests.anonyme();
select throws_ok($$ select public.console_pilotage() $$, '42501', null, 'un visiteur ne lit rien');
reset role; select tests.connecte('admin_plateforme');
select throws_ok($$ select public.console_pilotage() $$, '42501', null,
  'même un administrateur connecté passe par la console (clé service_role), pas par l''API');
reset role; select tests.service();
select ok(jsonb_array_length(public.console_pilotage()) >= 3, 'toutes les boutiques, une ligne chacune');

-- ---------------------------------------------------------------------
-- Identité et marque
-- ---------------------------------------------------------------------
select results_eq($$ select pg_temp.ligne('A') ->> 'statut', pg_temp.ligne('A') ->> 'hote', pg_temp.ligne('C') ->> 'statut' $$,
  $$ values ('active', 'essai-a.test', 'suspendue') $$, 'le statut et le domaine principal');
select results_eq($$ select pg_temp.ligne('A') #>> '{marque,code}', pg_temp.ligne('A') #>> '{marque,couleurs,accent}',
                            pg_temp.ligne('B') #>> '{marque,code}' $$,
  $$ values ('editorial', '#8A6224', 'technique') $$, 'le gabarit et les couleurs posées par la boutique');
select is(pg_temp.ligne('A') #>> '{marque,image}', null, 'sans section d''ouverture : pas d''image');

reset role;
update public.themes set sections = '[{"type": "selection"}, {"type": "hero", "image": {"chemin": "essai-a/accueil/ouverture-2000.webp"}}]'
 where boutique_id = tests.id('A');
select tests.service();
select is(pg_temp.ligne('A') #>> '{marque,image}', 'essai-a/accueil/ouverture-2000.webp', 'l''image de la section d''ouverture');

-- ---------------------------------------------------------------------
-- Mise en place
-- ---------------------------------------------------------------------
select results_eq($$ select (pg_temp.ligne('A') #>> '{mise_en_place,total}')::int, pg_temp.ligne('A') #>> '{mise_en_place,prochaine}' $$,
  $$ values (10, 'recueil') $$, 'dix étapes ; le recueil vient en premier');
reset role;
insert into plateforme.mise_en_place (boutique_id, etape) values (tests.id('A'), 'recueil');
select tests.service();
select isnt(pg_temp.ligne('A') #>> '{mise_en_place,prochaine}', 'recueil', 'le recueil coché : la prochaine étape est la suivante à faire');

-- ---------------------------------------------------------------------
-- Commandes
-- ---------------------------------------------------------------------
select results_eq($$ select (pg_temp.ligne('A') #>> '{commandes,a_confirmer}')::int, (pg_temp.ligne('B') #>> '{commandes,a_confirmer}')::int $$,
  $$ values (2, 1) $$, 'les commandes à confirmer, boutique par boutique');
select ok(pg_temp.ligne('A') #>> '{commandes,attente_depuis}' is not null, 'et depuis quand la plus ancienne attend');
select is(jsonb_array_length(pg_temp.ligne('A') -> 'jours'), 7, 'sept jours, jour par jour');
select is((pg_temp.ligne('A') -> 'jours' ->> 6)::int, 2, 'le dernier est aujourd''hui : les deux commandes du jour');

reset role;
update public.commandes set created_at = now() - interval '3 days' where id = tests.id('commande_a');
update public.commandes set created_at = now() - interval '20 days' where id = tests.id('commande_ab_a');
select tests.service();
select results_eq($$ select (pg_temp.ligne('A') -> 'jours' ->> 6)::int, (pg_temp.ligne('A') -> 'jours' ->> 3)::int,
                            (pg_temp.ligne('A') #>> '{commandes,semaine}')::int $$,
  $$ values (0, 1, 1) $$, 'une commande d''il y a trois jours tombe trois jours plus tôt ; celle d''il y a vingt jours sort de la semaine');

reset role;
update public.commandes set statut = 'confirmee' where id = tests.id('commande_a');
update public.commandes set statut = 'expediee', transporteur = 'Aramex' where id = tests.id('commande_a');
update public.commandes set statut = 'livree', statut_paiement = 'paye' where id = tests.id('commande_a');
select tests.service();
select is((pg_temp.ligne('A') #>> '{commandes,encaisse_semaine}')::bigint,
          (select total_millimes from public.commandes where id = tests.id('commande_a')),
  'livrée cette semaine : elle compte dans l''encaissé');

-- ---------------------------------------------------------------------
-- Accès support
-- ---------------------------------------------------------------------
select is(pg_temp.ligne('A') -> 'support', 'null'::jsonb, 'personne du support n''y est entré');
reset role;
insert into plateforme.acces_support (boutique_id, user_id, role, motif, expire_le)
values (tests.id('A'), tests.id('admin_plateforme'), 'lecture', 'Vérifier les frais de livraison', now() + interval '1 hour');
select tests.service();
select is(pg_temp.ligne('A') #>> '{support,role}', 'lecture', 'un accès ouvert se voit, avec son mode');

select * from finish();
rollback;
