-- =====================================================================
-- 48 · Les paniers abandonnés
-- =====================================================================
begin;
\ir outils.psql

select plan(30);

create function tests.indice(p_sql text) returns text
language plpgsql as $$
declare
  v_indice text;
begin
  execute p_sql;
  raise exception 'passée' using hint = '__passee__';
exception when others then
  get stacked diagnostics v_indice = pg_exception_hint;
  return case when v_indice = '__passee__' then null else coalesce(nullif(v_indice, ''), 'sans indice') end;
end;
$$;
grant execute on function tests.indice(text) to anon, authenticated, service_role;

-- Une acheteuse connectée de la boutique A (son numéro vient de son compte).
reset role;
update auth.users set phone = '21620600001' where id = tests.id('client_a');
-- Sa commande du jeu d'essai remonte au mois dernier : ses paniers d'aujourd'hui n'ont rien donné.
update public.commandes set created_at = created_at - interval '30 days' where boutique_id = tests.id('A');

create function pg_temp.garde(p_qte integer default 1) returns boolean language sql as $$
  select public.garder_panier(tests.id('A'),
    jsonb_build_array(jsonb_build_object('variante_id', tests.id('variante_a'), 'quantite', p_qte),
                      jsonb_build_object('variante_id', tests.id('variante_b'), 'quantite', 1)))
$$;
create function pg_temp.vieillit(p_heures integer) returns void language sql as $$
  update public.paniers_suivis set updated_at = updated_at - make_interval(hours => p_heures), created_at = created_at - make_interval(hours => p_heures)
   where boutique_id = tests.id('A')
$$;
create function pg_temp.le_panier() returns uuid language sql as $$
  select id from public.paniers_suivis where boutique_id = tests.id('A')
$$;
grant execute on all functions in schema pg_temp to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- Le tunnel garde le panier
-- ---------------------------------------------------------------------
select tests.connecte('client_a');
select is(pg_temp.garde(), false, 'réglage coupé : rien n''est gardé');
reset role;
insert into public.reglages (boutique_id, cle, valeur) values (tests.id('A'), 'commande.relance_paniers', 'true');
select tests.anonyme();
select throws_ok($$ select pg_temp.garde() $$, '42501', null, 'un visiteur sans compte : la base ne garde rien');
reset role; select tests.connecte('client_a');
select is(pg_temp.garde(), true, 'connectée : le panier est gardé');
reset role;
select results_eq($$ select telephone, articles, jsonb_array_length(lignes), sous_total_millimes from public.paniers_suivis where boutique_id = tests.id('A') $$,
  $$ values ('+21620600001', 1, 1, 189000::bigint) $$,
  'son numéro, ses articles, son montant relu en base ; la déclinaison d''une autre boutique est écartée');
select tests.connecte('client_a');
select pg_temp.garde(2);
reset role;
select results_eq($$ select articles, sous_total_millimes, count(*) over () from public.paniers_suivis where boutique_id = tests.id('A') $$,
  $$ values (2, 378000::bigint, 1::bigint) $$, 'un seul panier par personne : il suit ses changements');
select tests.connecte('client_a');
select is(public.garder_panier(tests.id('A'), '[{"variante_id": "pas-un-uuid", "quantite": 1}]'::jsonb), false,
  'un panier illisible : ignoré, sans erreur');

-- La commande en invité : le tunnel ne lit pas la session, il n'a rien pu dire.
reset role;
insert into public.reglages (boutique_id, cle, valeur) values (tests.id('A'), 'compte.obligatoire', 'false')
on conflict (boutique_id, cle) do update set valeur = excluded.valeur;
select tests.connecte('client_a');
select is(pg_temp.garde(3), false, 'commande en invité : rien n''est gardé');
reset role; select tests.connecte('proprio_a');
select results_eq($$ select (e ->> 'invites')::boolean, (e #>> '{paniers}') from (select public.gestion_paniers(tests.id('A')) e) x $$,
  $$ values (true, '[]') $$, 'l''écran le dit ; le panier d''avant n''a pas bougé (pas encore abandonné)');
reset role;
delete from public.reglages where boutique_id = tests.id('A') and cle = 'compte.obligatoire';
select is((select articles from public.paniers_suivis where boutique_id = tests.id('A')), 2, 'le panier gardé avant est intact');

-- ---------------------------------------------------------------------
-- Abandonné, relancé, commandé
-- ---------------------------------------------------------------------
reset role; select tests.connecte('proprio_a');
select is(public.gestion_paniers_etat(tests.id('A')) ->> 'a_relancer', '0', 'depuis moins d''une heure : pas encore abandonné');
reset role; select pg_temp.vieillit(3); select tests.connecte('proprio_a');
select results_eq($$ select (e #>> '{compteurs,a_relancer}')::integer, e #>> '{paniers,0,etat}', e #>> '{paniers,0,lignes,0,produit}', (e #>> '{paniers,0,lignes,0,quantite}')::integer
                       from (select public.gestion_paniers(tests.id('A')) e) x $$,
  $$ values (1, 'a_relancer', 'Valise cabine', 2) $$, 'trois heures sans bouger : à relancer, avec ce qu''il contient');
select is(public.gestion_paniers_etat(tests.id('A')) ->> 'a_relancer', '1', 'la navigation le compte');

reset role; select tests.connecte('proprio_b');
select is((select count(*)::integer from public.paniers_suivis where boutique_id = tests.id('A')), 0, 'une autre boutique ne voit rien des paniers de A');
select throws_ok($$ select public.gestion_paniers(tests.id('A')) $$, '42501', null, 'ni leur écran');

-- Le lien de la relance : le panier, pour n'importe quel navigateur.
reset role;
insert into tests.ids (nom, id) select 'panier_a', id from public.paniers_suivis where boutique_id = tests.id('A');
select tests.anonyme();
select results_eq($$ select e #>> '{lignes,0,produit}', (e #>> '{lignes,0,quantite}')::integer, (e #>> '{lignes,0,disponible}')::boolean,
                            jsonb_array_length(e -> 'lignes'), e::text ~ '2162|Client A'
                       from (select public.panier_a_reprendre(tests.id('A'), tests.id('panier_a')) e) x $$,
  $$ values ('Valise cabine', 2, true, 1, false) $$, 'le lien de la relance, sans compte : les pièces, rien de la personne');
select is(public.panier_a_reprendre(tests.id('B'), tests.id('panier_a')), null, 'l''identifiant ne vaut que dans sa boutique');

reset role; select tests.connecte('prepa_a');
select throws_ok($$ select public.gestion_geste_panier(tests.id('A'), pg_temp.le_panier(), 'relance') $$,
  '42501', null, 'la préparation ne relance pas les clients');
reset role; select tests.connecte('confirm_a');
select is(public.gestion_geste_panier(tests.id('A'), pg_temp.le_panier(), 'relance') ->> 'geste', 'relance',
  'la confirmation le relance');
select is(tests.indice($$ select public.gestion_geste_panier(tests.id('A'), pg_temp.le_panier(), 'relance') $$),
  'etat', 'une fois, pas deux');
select is(public.gestion_paniers_etat(tests.id('A')) ->> 'a_relancer', '0', 'relancé : il ne compte plus');

-- Elle commande après la relance : la relance a porté.
reset role;
insert into public.commandes (boutique_id, numero, origine, client_id, contact_nom, contact_telephone, livraison_ligne1, livraison_ville,
                              livraison_gouvernorat, livraison_zone_nom, sous_total_millimes, frais_livraison_millimes, total_millimes, created_at)
values (tests.id('A'), 'MAY-2026-00900', 'vitrine', (select id from public.clients where boutique_id = tests.id('A') and user_id = tests.id('client_a')),
        'Acheteuse', '+21620600001', '1 rue de Rome', 'Tunis', 'tunis', 'Grand Tunis', 378000, 6000, 384000, clock_timestamp());
select tests.connecte('proprio_a');
select results_eq($$ select (e #>> '{compteurs,commandes_apres_relance}')::integer, e #>> '{paniers,0,commande}'
                       from (select public.gestion_paniers(tests.id('A')) e) x $$,
  $$ values (1, 'MAY-2026-00900') $$, 'relancé, puis commandé : la commande est citée');

-- Un nouveau panier après la commande : une nouvelle relance possible.
reset role; select tests.connecte('client_a');
select pg_temp.garde(1);
reset role;
select results_eq($$ select relance_le is null, articles from public.paniers_suivis where boutique_id = tests.id('A') $$,
  $$ values (true, 1) $$, 'commandé depuis : le panier suivant repart de zéro');

-- Ignoré (la commande d'avant remonte à hier : ce panier-ci n'a rien donné).
update public.commandes set created_at = created_at - interval '1 day' where boutique_id = tests.id('A') and numero = 'MAY-2026-00900';
select pg_temp.vieillit(2);
select tests.connecte('proprio_a');
select is(public.gestion_geste_panier(tests.id('A'), pg_temp.le_panier(), 'ignore') ->> 'geste', 'ignore',
  'la direction peut aussi l''ignorer');

-- ---------------------------------------------------------------------
-- Ce qui s'efface : vidé, trop vieux, réglage coupé
-- ---------------------------------------------------------------------
reset role; update public.paniers_suivis set ignore_le = null where boutique_id = tests.id('A');
select tests.connecte('client_a');
select is(public.garder_panier(tests.id('A'), '[]'::jsonb), false, 'un panier vidé n''est plus gardé');
reset role;
select is((select count(*)::integer from public.paniers_suivis where boutique_id = tests.id('A')), 0, 'il s''efface');

select tests.connecte('client_a'); select pg_temp.garde(1);
reset role; select pg_temp.vieillit(61 * 24);
select tests.connecte('lecture_a'); select public.gestion_paniers_etat(tests.id('A'));
reset role;
select is((select count(*)::integer from public.paniers_suivis where boutique_id = tests.id('A')), 0,
  'plus de 60 jours : effacé au passage de l''équipe, même sans nouveau client');

select tests.connecte('client_a'); select pg_temp.garde(1);
reset role;
delete from public.reglages where boutique_id = tests.id('A') and cle = 'commande.relance_paniers';
select is((select count(*)::integer from public.paniers_suivis where boutique_id = tests.id('A')), 0,
  'le réglage coupé : les paniers gardés s''effacent');

-- ---------------------------------------------------------------------
-- Journal et droits
-- ---------------------------------------------------------------------
select is((select count(*)::integer from plateforme.journal_audit where boutique_id = tests.id('A') and action like 'panier.%'), 2,
  'relancé et ignoré, au journal');
select ok(not has_function_privilege('anon', 'public.garder_panier(uuid, jsonb)', 'execute')
          and not has_function_privilege('anon', 'public.gestion_paniers(uuid)', 'execute')
          and not has_function_privilege('anon', 'public.gestion_paniers_etat(uuid)', 'execute'),
  'rien pour un visiteur');
select ok(not has_table_privilege('authenticated', 'public.paniers_suivis', 'insert')
          and not has_table_privilege('authenticated', 'public.paniers_suivis', 'update'),
  'personne n''écrit dans la table : les fonctions seulement');

select * from finish();
rollback;
