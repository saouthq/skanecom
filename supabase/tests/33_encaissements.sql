-- =====================================================================
-- 33 · L'argent des livreurs : à recevoir, versements, écarts
-- =====================================================================
begin;
\ir outils.psql

select plan(29);

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

-- Jeu d'essai, boutique A : deux colis livrés par Aramex (l'un saisi
-- « aramex » en minuscules), un par First Delivery ; et ce qui n'est pas à
-- recevoir : un retrait au comptoir, un paiement en ligne, un colis refusé,
-- un colis encore en route.
create function pg_temp.colis(p_nom text, p_statut public.statut_commande, p_transporteur text, p_total bigint,
                              p_jours numeric, p_paiement public.mode_paiement default 'cod', p_mode text default 'domicile')
returns void language sql as $$
  insert into public.commandes (id, boutique_id, client_id, contact_nom, contact_telephone, livraison_ligne1, livraison_ville,
                                livraison_gouvernorat, statut, mode_paiement, mode_livraison, transporteur, total_millimes,
                                livree_at, refus_origine)
  values (tests.nouvel_id(p_nom), tests.id('A'), tests.id('fiche_client_a'), 'Client A', '+21620000001', '1 rue de Rome', 'Tunis',
          'tunis', p_statut, p_paiement, p_mode, p_transporteur, p_total,
          case when p_statut = 'livree' then now() - make_interval(secs => p_jours * 86400) end,
          case when p_statut = 'refusee' then 'client'::public.origine_refus end)
$$;
select pg_temp.colis('aramex_1', 'livree',   'Aramex',         100000, 3);
select pg_temp.colis('aramex_2', 'livree',   ' aramex ',        50000, 1);
select pg_temp.colis('first_1',  'livree',   'First Delivery',  70000, 2);
select pg_temp.colis('retrait',  'livree',   null,              40000, 1, 'cod', 'retrait');
select pg_temp.colis('en_ligne', 'livree',   'Aramex',          30000, 1, 'konnect');
select pg_temp.colis('refuse',   'refusee',  'Aramex',          20000, 1);
select pg_temp.colis('en_route', 'expediee', 'Aramex',          10000, 1);

create temp view n as select c.numero, x.nom from public.commandes c
  join (values ('aramex_1'), ('aramex_2'), ('first_1'), ('retrait'), ('en_ligne'), ('refuse'), ('en_route')) x (nom) on c.id = tests.id(x.nom);
grant select on n to anon, authenticated;
create function pg_temp.num(p_nom text) returns text language sql as $$ select numero from n where nom = p_nom $$;

create function pg_temp.e() returns jsonb language sql as $$ select public.gestion_encaissements(tests.id('A')) $$;
create function pg_temp.verse(p_transporteur text, p_noms text[], p_recu bigint, p_le date default current_date)
returns jsonb language sql as $$
  select public.gestion_enregistrer_versement(tests.id('A'), p_transporteur,
           array(select pg_temp.num(x) from unnest(p_noms) x), p_recu, p_le, 'VIR-0925', null)
$$;

-- ---------------------------------------------------------------------
-- Qui lit, qui enregistre
-- ---------------------------------------------------------------------
reset role; select tests.anonyme();
select throws_ok($$ select pg_temp.e() $$, '42501', null, 'un visiteur ne lit rien');
reset role; select tests.connecte('confirm_a');
select throws_ok($$ select pg_temp.e() $$, '42501', null, 'la confirmation ne lit pas l''argent');
reset role; select tests.connecte('proprio_b');
select throws_ok($$ select pg_temp.e() $$, '42501', null, 'une autre boutique non plus');
select throws_ok($$ select pg_temp.verse('Aramex', '{aramex_1}', 100000) $$, '42501', null, '… ni n''enregistre chez elle');

reset role; select tests.connecte('lecture_a');
select is(jsonb_array_length(pg_temp.e() -> 'a_recevoir'), 2, 'à recevoir : deux transporteurs (la casse ne fait pas un livreur de plus)');
select results_eq($$ select g ->> 'transporteur', (g ->> 'nombre')::int, (g ->> 'total_millimes')::bigint
                       from jsonb_array_elements(pg_temp.e() -> 'a_recevoir') g $$,
  $$ values ('Aramex', 2, 150000::bigint), ('First Delivery', 1, 70000::bigint) $$,
  'le plus ancien colis d''abord ; ni retrait, ni paiement en ligne, ni refusé, ni en route');
select is(pg_temp.e() -> 'a_recevoir' -> 0 -> 'commandes' -> 0 ->> 'numero', pg_temp.num('aramex_1'), 'dans un transporteur, le colis livré le plus tôt en tête');
select is(tests.indice($$ select pg_temp.verse('Aramex', '{aramex_1}', 100000) $$), 'role', 'la lecture n''enregistre pas');
reset role; select tests.connecte('prepa_a');
select is(tests.indice($$ select pg_temp.verse('Aramex', '{aramex_1}', 100000) $$), 'role', 'la préparation non plus');
reset role; select tests.connecte('proprio_a');

-- ---------------------------------------------------------------------
-- Un versement, son écart
-- ---------------------------------------------------------------------
select results_eq($$ select (r ->> 'nombre')::int, (r ->> 'attendu_millimes')::bigint, (r ->> 'ecart_millimes')::bigint
                       from (select pg_temp.verse('Aramex', '{aramex_1,aramex_2}', 145000) r) x $$,
  $$ values (2, 150000::bigint, -5000::bigint) $$, 'deux colis Aramex, 145 TND reçus : 5 TND d''écart (frais retenus)');
select is(jsonb_array_length(pg_temp.e() -> 'a_recevoir'), 1, 'Aramex n''a plus rien à reverser');
select is((select count(*)::int from public.versements) + (select count(*)::int from public.versement_commandes), 0,
  'aucune lecture directe des versements par l''API : seulement par les fonctions');
select throws_ok($$ delete from public.versement_commandes $$, '42501', null, 'ni effacement direct d''un rapprochement');
select results_eq($$ select v ->> 'transporteur', (v ->> 'recu_millimes')::bigint, (v ->> 'ecart_millimes')::bigint,
                            jsonb_array_length(v -> 'numeros'), v ->> 'reference', (v ->> 'auteur') is not null
                       from (select pg_temp.e() -> 'versements' -> 0 as v) x $$,
  $$ values ('Aramex', 145000::bigint, -5000::bigint, 2, 'VIR-0925', true) $$, 'le versement : reçu, écart, ses colis, sa référence, son auteur');
select results_eq($$ select (t ->> 'nombre')::int, (t ->> 'recu_millimes')::bigint, (t ->> 'ecart_millimes')::bigint
                       from (select pg_temp.e() -> 'trente_jours' as t) x $$,
  $$ values (1, 145000::bigint, -5000::bigint) $$, 'sur trente jours : ce qui est rentré, l''écart cumulé');

-- ---------------------------------------------------------------------
-- Ce qui est refusé
-- ---------------------------------------------------------------------
select is(tests.indice($$ select pg_temp.verse('Aramex', '{aramex_1}', 100000) $$), 'deja', 'un colis déjà rapproché ne l''est pas deux fois');
select is(tests.indice($$ select pg_temp.verse('Aramex', '{first_1}', 70000) $$), 'transporteur', 'un colis d''un autre livreur : non');
select is(tests.indice($$ select pg_temp.verse(null, '{retrait}', 40000) $$), 'commande', 'un retrait au comptoir ne passe pas par un livreur');
select is(tests.indice($$ select pg_temp.verse('Aramex', '{en_ligne}', 30000) $$), 'commande', 'un paiement en ligne non plus');
select is(tests.indice($$ select pg_temp.verse('Aramex', '{en_route}', 10000) $$), 'commande', 'un colis encore en route non plus');
select is(tests.indice($$ select pg_temp.verse('First Delivery', '{}', 0) $$), 'commandes', 'un versement sans colis : non');
select is(tests.indice($$ select pg_temp.verse('First Delivery', '{first_1}', -1) $$), 'montant', 'un montant négatif : non');
select is(tests.indice($$ select pg_temp.verse('First Delivery', '{first_1}', 70000, current_date + 3) $$), 'date', 'un versement daté de demain : non');
select is(tests.indice(format($$ select public.gestion_enregistrer_versement(%L, 'First Delivery', '{MAY-2099-99999}', 1, current_date) $$, tests.id('A'))),
  'commande', 'une commande inconnue : non');

-- ---------------------------------------------------------------------
-- Annuler une saisie
-- ---------------------------------------------------------------------
reset role; select tests.connecte('lecture_a');
select is(tests.indice(format($$ select public.gestion_annuler_versement(%L, %L) $$, tests.id('A'), pg_temp.e() -> 'versements' -> 0 ->> 'id')),
  'role', 'la lecture n''annule pas');
reset role; select tests.connecte('multi');  -- administrateur de A
select lives_ok(format($$ select public.gestion_annuler_versement(%L, %L) $$, tests.id('A'), pg_temp.e() -> 'versements' -> 0 ->> 'id'),
  'l''administrateur annule une saisie erronée');
select results_eq($$ select jsonb_array_length(pg_temp.e() -> 'a_recevoir'), (pg_temp.e() -> 'versements' -> 0 ->> 'annule_le') is not null,
                            jsonb_array_length(pg_temp.e() -> 'versements' -> 0 -> 'numeros'), (pg_temp.e() -> 'trente_jours' ->> 'nombre')::int $$,
  $$ values (2, true, 2, 0) $$, 'ses colis redeviennent à recevoir ; il reste au journal avec ses colis, hors des totaux');
select is(tests.indice(format($$ select public.gestion_annuler_versement(%L, %L) $$, tests.id('A'), pg_temp.e() -> 'versements' -> 0 ->> 'id')),
  'versement', 'une saisie ne s''annule qu''une fois');

-- L'export pour le comptable : chaque versement, annulé compris (et dit tel).
select results_eq($$ select x ->> 'transporteur', (x ->> 'ecart')::bigint, (x ->> 'colis')::int, (x ->> 'annule_le') is not null
                       from jsonb_array_elements(public.gestion_export(tests.id('A'), 'versements')) x $$,
  $$ values ('Aramex', -5000::bigint, 2, true) $$, 'l''export des versements : écart, colis, annulation');

select * from finish();
rollback;
