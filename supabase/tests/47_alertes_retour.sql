-- =====================================================================
-- 47 · « Prévenez-moi de son retour »
-- =====================================================================
begin;
\ir outils.psql

select plan(26);

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

-- Une valise épuisée, une boîte de vis sous son minimum (3 en stock, par 5),
-- et une pièce d'un produit pas encore en vitrine.
insert into public.variantes (id, boutique_id, produit_id, sku, options, prix_millimes, stock, actif) values
  (tests.nouvel_id('v_epuisee'), tests.id('A'), tests.id('produit_a'), 'VAL-55-ROUGE', '{"couleur": "Rouge"}', 189000, 0, true);
insert into public.variantes (id, boutique_id, produit_id, sku, options, prix_millimes, stock, actif, quantite_min) values
  (tests.nouvel_id('v_lot'), tests.id('A'), tests.id('produit_a'), 'VAL-55-VERT', '{"couleur": "Vert"}', 189000, 3, true, 5);
insert into public.variantes (id, boutique_id, produit_id, sku, options, prix_millimes, stock, actif) values
  (tests.nouvel_id('v_brouillon'), tests.id('A'), tests.id('produit_a_brouillon'), 'BROUILLON-2', '{"t": "2"}', 1000, 0, true);

create function pg_temp.demande(p_variante text, p_tel text, p_email text default null) returns jsonb language sql as $$
  select public.demander_alerte_retour(tests.id('A'), tests.id(p_variante), p_tel, p_email)
$$;
create function pg_temp.statuts(p_variante text) returns text language sql as $$
  select string_agg(statut || ':' || coalesce(telephone, email, '-'), ' ' order by created_at, statut)
    from public.alertes_retour where variante_id = tests.id(p_variante)
$$;
grant execute on all functions in schema pg_temp to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- La demande, depuis la vitrine
-- ---------------------------------------------------------------------
reset role; select tests.anonyme();
select is(tests.indice($$ select pg_temp.demande('v_epuisee', '20 300 001') $$), 'reglage', 'réglage coupé : la boutique ne propose pas l''alerte');
reset role;
insert into public.reglages (boutique_id, cle, valeur) values (tests.id('A'), 'catalogue.prevenir_retour', 'true');
select tests.anonyme();
select is(tests.indice($$ select pg_temp.demande('variante_a', '20 300 001') $$), 'disponible', 'une pièce en stock se commande, elle ne se guette pas');
select is(tests.indice($$ select pg_temp.demande('v_brouillon', '20 300 001') $$), 'variante', 'une pièce hors vitrine : rien');
select is(tests.indice($$ select pg_temp.demande('v_epuisee', '12 34') $$), 'telephone', 'un numéro illisible est refusé');
select is(tests.indice($$ select pg_temp.demande('v_epuisee', null, 'pas-une-adresse') $$), 'email', 'une adresse illisible aussi');
select is(tests.indice($$ select pg_temp.demande('v_epuisee', ' ', '') $$), 'contact', 'sans contact, pas de demande');
select is(pg_temp.demande('v_epuisee', '20 300 001') ->> 'deja', 'false', 'la valise épuisée : la demande est notée');
select is(pg_temp.demande('v_epuisee', '+216 20300001') ->> 'deja', 'true', 'le même numéro, écrit autrement : déjà noté, rien de plus');
select is(pg_temp.demande('v_epuisee', null, 'Nour@Exemple.tn') ->> 'deja', 'false', 'une autre personne, par e-mail');
select is(pg_temp.demande('v_lot', '20 300 002') ->> 'deja', 'false', 'sous son minimum de commande, la pièce se guette aussi');
select is((select count(*)::integer from public.alertes_retour), 0, 'un visiteur ne lit aucune demande');

-- ---------------------------------------------------------------------
-- Le stock revient
-- ---------------------------------------------------------------------
reset role; select tests.connecte('prepa_a');
select public.gestion_mouvement_stock(tests.id('A'), tests.id('v_epuisee'), 'reception', 4, 'Arrivage');
select public.gestion_mouvement_stock(tests.id('A'), tests.id('v_lot'), 'reception', 1, 'Arrivage partiel');
reset role;
select results_eq($$ select pg_temp.statuts('v_epuisee'), pg_temp.statuts('v_lot') $$,
  $$ values ('a_prevenir:+21620300001 a_prevenir:nour@exemple.tn', 'attend:+21620300002') $$,
  'l''arrivage : la valise est à prévenir ; les vis, à 4 pour un minimum de 5, attendent encore');
select tests.connecte('prepa_a');
select public.gestion_mouvement_stock(tests.id('A'), tests.id('v_lot'), 'reception', 1, 'Le reste');
reset role;
select is(pg_temp.statuts('v_lot'), 'a_prevenir:+21620300002', 'à 5, le minimum est atteint : à prévenir');

select tests.connecte('lecture_a');
select results_eq($$ select (e #>> '{compteurs,a_prevenir}')::integer, jsonb_array_length(e #> '{pieces,0,a_prevenir}'), (e #>> '{pieces,0,disponible}')::boolean
                       from (select public.gestion_alertes_retour(tests.id('A')) e) x $$,
  $$ values (3, 2, true) $$, 'l''écran : trois personnes à prévenir, la pièce la plus demandée d''abord, disponible');
select is(public.gestion_alertes_etat(tests.id('A')) ->> 'a_prevenir', '3', 'la navigation compte les personnes à prévenir');

-- ---------------------------------------------------------------------
-- Prévenues : le contact s'efface
-- ---------------------------------------------------------------------
select throws_ok($$ select public.gestion_clore_alertes(tests.id('A'), array(select id from public.alertes_retour where variante_id = tests.id('v_epuisee')), 'prevenue') $$,
  '42501', null, 'la lecture ne marque rien');
reset role; select tests.connecte('prepa_a');
select throws_ok($$ select public.gestion_clore_alertes(tests.id('A'), array(select id from public.alertes_retour where variante_id = tests.id('v_epuisee')), 'prevenue') $$,
  '42501', null, 'la préparation non plus : prévenir, c''est parler aux clients');
reset role; select tests.connecte('confirm_a');
select is(public.gestion_clore_alertes(tests.id('A'), array(select id from public.alertes_retour where variante_id = tests.id('v_epuisee')), 'prevenue'), 2,
  'la confirmation les marque prévenues');
reset role;
select is(pg_temp.statuts('v_epuisee'), 'prevenue:- prevenue:-', 'prévenues : ni téléphone ni e-mail ne restent');
select tests.connecte('confirm_a');
select is(tests.indice($$ select public.gestion_clore_alertes(tests.id('A'), array(select id from public.alertes_retour where variante_id = tests.id('v_epuisee')), 'prevenue') $$),
  'etat', 'deux fois : déjà traitées');

-- La valise se vend, s'épuise de nouveau : la même personne peut redemander.
reset role;
select set_config('skanecom.ecriture_stock', 'on', true);
update public.variantes set stock = 0 where id = tests.id('v_epuisee');
select set_config('skanecom.ecriture_stock', '', true);
select tests.anonyme();
select is(pg_temp.demande('v_epuisee', '20 300 001') ->> 'deja', 'false', 'épuisée de nouveau : une nouvelle demande');

-- Dix demandes par contact et par jour.
reset role;
insert into public.variantes (id, boutique_id, produit_id, sku, options, prix_millimes, stock, actif)
select gen_random_uuid(), tests.id('A'), tests.id('produit_a'), 'VAL-X-' || n, jsonb_build_object('couleur', 'Teinte ' || n), 189000, 0, true
  from generate_series(1, 11) n;
select tests.anonyme();
select is(tests.indice($$ select public.demander_alerte_retour(tests.id('A'), v.id, '20 300 009', null) from public.variantes v
                          where v.boutique_id = tests.id('A') and v.sku like 'VAL-X-%' order by v.sku $$), 'essais',
  'au-delà de dix demandes dans la journée : refusé');

-- ---------------------------------------------------------------------
-- Journal, cloisons, droits
-- ---------------------------------------------------------------------
reset role;
select is((select count(*)::integer from plateforme.journal_audit where boutique_id = tests.id('A') and action = 'alerte_retour.prevenue'), 1,
  'prévenues, au journal');
select tests.connecte('proprio_b');
select is(jsonb_array_length(public.gestion_alertes_retour(tests.id('B')) -> 'pieces'), 0, 'une autre boutique ne voit rien de A');
reset role;
select ok(has_function_privilege('anon', 'public.demander_alerte_retour(uuid, uuid, text, text)', 'execute')
          and not has_function_privilege('anon', 'public.gestion_alertes_retour(uuid)', 'execute')
          and not has_function_privilege('authenticated', 'private.alertes_au_retour()', 'execute'),
  'le visiteur demande, il ne lit pas la liste');

select is(public.configuration_publique(tests.id('A')) #>> '{reglages,commande.prefixe_numero}', 'MAY',
  'au passage : la vitrine connaît le préfixe des numéros (l''exemple de « Suivre ma commande »)');

select * from finish();
rollback;
