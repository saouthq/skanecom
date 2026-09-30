-- =====================================================================
-- 45 · Les codes promo (module « promotions »)
-- =====================================================================
begin;
\ir outils.psql

select plan(52);

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

-- La valise de A (189 TND), livrée à Tunis (zone Grand Tunis : 6 TND).
create function pg_temp.devis(p_code text, p_gouv text default 'tunis', p_mode text default null, p_qte integer default 1)
returns jsonb language sql as $$
  select public.devis_commande(tests.id('A'),
    jsonb_build_array(jsonb_build_object('variante_id', tests.id('variante_a'), 'quantite', p_qte)), p_gouv, p_mode, p_code)
$$;
create function pg_temp.passe(p_cle text, p_tel text, p_code text, p_total bigint)
returns jsonb language sql as $$
  select public.passer_commande(tests.id('A'), 'essai-promo-' || p_cle || '-000000',
    jsonb_build_array(jsonb_build_object('variante_id', tests.id('variante_a'), 'quantite', 1)),
    jsonb_build_object('nom', 'Acheteuse ' || p_cle, 'telephone', p_tel, 'accepte_conditions', true),
    jsonb_build_object('ligne1', '5 rue de Marseille', 'ville', 'Tunis', 'gouvernorat', 'tunis'),
    p_total, null, p_code)
$$;
-- Créer un code comme la boutique le fait (propriétaire de A).
create function pg_temp.cree(p_code text, p_type text, p_valeur bigint, p_minimum bigint default 0,
                             p_debut date default null, p_fin date default null, p_limite integer default null,
                             p_une_fois boolean default true)
returns jsonb language sql as $$
  select public.gestion_enregistrer_code(tests.id('A'), null, p_code, p_type, p_valeur, p_minimum, p_debut, p_fin, p_limite, p_une_fois, null)
$$;
create function pg_temp.id_code(p_code text) returns uuid language sql as $$
  select id from public.codes_promo where boutique_id = tests.id('A') and code = p_code
$$;
grant execute on all functions in schema pg_temp to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- Module coupé : rien
-- ---------------------------------------------------------------------
reset role; select tests.anonyme();
select results_eq($$ select pg_temp.devis('BIENVENUE10') #>> '{code,raison}', (pg_temp.devis('BIENVENUE10') ->> 'total_millimes')::bigint $$,
  $$ values ('inconnu', 195000::bigint) $$, 'module coupé : aucun code ne vaut, le total reste celui des articles et des frais');
select is(pg_temp.devis(null) -> 'code', 'null'::jsonb, 'sans code : rien à dire');
reset role; select tests.connecte('proprio_a');
select is(tests.indice($$ select pg_temp.cree('BIENVENUE10', 'pourcentage', 10) $$), 'module', 'module coupé : la boutique ne crée pas de code');

reset role;
insert into plateforme.modules_actifs (boutique_id, module) values (tests.id('A'), 'promotions'), (tests.id('B'), 'promotions');
select is((select disponible from plateforme.modules where code = 'promotions'), true, 'le module est disponible à la console');

-- ---------------------------------------------------------------------
-- Créer : la forme, les rôles
-- ---------------------------------------------------------------------
reset role; select tests.connecte('proprio_a');
select is(tests.indice($$ select pg_temp.cree('É!', 'pourcentage', 10) $$), 'code', 'un code illisible est refusé');
select is(tests.indice($$ select pg_temp.cree('ETE', null, 10) $$), 'type', 'il faut dire ce que le code offre');
select is(tests.indice($$ select pg_temp.cree('ETE', 'pourcentage', 95) $$), 'valeur', 'une remise de 90 % au plus');
select is(tests.indice($$ select pg_temp.cree('ETE', 'montant', 500) $$), 'valeur', 'un montant d''au moins 1 TND');
select is(tests.indice($$ select pg_temp.cree('ETE', 'pourcentage', 10, 0, current_date, current_date - 1) $$), 'dates',
  'le dernier jour vient après le premier');
select is(pg_temp.cree(' bienvenue 10 ', 'pourcentage', 10, 100000) ->> 'code', 'BIENVENUE10',
  'tapé en minuscules, avec des espaces : rangé en capitales');
select is(tests.indice($$ select pg_temp.cree('Bienvenue10', 'montant', 5000) $$), 'doublon', 'deux fois le même code : refusé');
select is((select jsonb_build_object('type', type, 'valeur', valeur, 'minimum', minimum_millimes, 'une_fois', une_fois_par_client)
             from public.codes_promo where id = pg_temp.id_code('BIENVENUE10')),
  '{"type": "pourcentage", "valeur": 10, "minimum": 100000, "une_fois": true}'::jsonb, 'le code et ses conditions');
select is((pg_temp.cree('PORT', 'livraison', 99000) ->> 'code'), 'PORT', 'la livraison offerte');
select is((select valeur from public.codes_promo where id = pg_temp.id_code('PORT')), null::bigint, 'la livraison offerte n''a pas de valeur');
reset role;
select is((select count(*)::integer from plateforme.journal_audit where boutique_id = tests.id('A') and action = 'code_promo.creer'), 2,
  'chaque création au journal');

reset role; select tests.connecte('confirm_a');
select throws_ok($$ select pg_temp.cree('APPEL', 'pourcentage', 5) $$, '42501', null, 'la confirmation ne crée pas de code (c''est un prix)');
reset role; select tests.connecte('lecture_a');
select is(jsonb_array_length(public.gestion_codes_promo(tests.id('A')) -> 'codes'), 2, 'la lecture voit les codes');
reset role; select tests.anonyme();
select throws_ok($$ select public.gestion_codes_promo(tests.id('A')) $$, '42501', null, 'un visiteur ne lit pas les codes');
reset role; select tests.connecte('proprio_b');
select is((select count(*)::integer from public.codes_promo where boutique_id = tests.id('A')), 0, 'une autre boutique ne voit pas les codes de A');
select is(public.gestion_enregistrer_code(tests.id('B'), null, 'CODEB', 'pourcentage', 50, 0, null, null, null, true, null) ->> 'code', 'CODEB',
  'B a ses propres codes');

-- ---------------------------------------------------------------------
-- Le devis : la remise, ou pourquoi pas
-- ---------------------------------------------------------------------
reset role; select tests.anonyme();
select results_eq($$ select (d #>> '{code,applique}')::boolean, (d ->> 'remise_millimes')::bigint, (d ->> 'total_millimes')::bigint
                       from (select pg_temp.devis('bienvenue10') d) x $$,
  $$ values (true, 18900::bigint, 176100::bigint) $$, '10 % des articles (189 TND) : 18,900 TND de moins, les frais restent');
select is(pg_temp.devis('CODEB') #>> '{code,raison}', 'inconnu', 'le code d''une autre boutique n''existe pas ici');
select is(pg_temp.devis('NEXISTEPAS') #>> '{code,type}', null, 'un code inconnu ne dit rien de plus');
select results_eq($$ select (d ->> 'remise_millimes')::bigint, (d ->> 'total_millimes')::bigint from (select pg_temp.devis('PORT') d) x $$,
  $$ values (6000::bigint, 189000::bigint) $$, 'la livraison offerte efface les frais du gouvernorat');
select results_eq($$ select (d #>> '{code,applique}')::boolean, d ->> 'total_millimes' from (select pg_temp.devis('PORT', null) d) x $$,
  $$ values (true, null::text) $$, 'sans gouvernorat, la livraison offerte est reconnue ; le total attend les frais');

reset role; select tests.connecte('proprio_a');
select pg_temp.cree('GROS', 'montant', 20000, 300000);
select pg_temp.cree('ENORME', 'montant', 500000);
select pg_temp.cree('BIENTOT', 'pourcentage', 15, 0, current_date + 2, current_date + 5);
select pg_temp.cree('PASSE', 'pourcentage', 15, 0, current_date - 10, current_date - 1);
select pg_temp.cree('UNE', 'montant', 10000, 0, null, null, 1, false);
reset role; select tests.anonyme();
select results_eq($$ select d #>> '{code,raison}', (d #>> '{code,manque_millimes}')::bigint, (d ->> 'remise_millimes')::bigint
                       from (select pg_temp.devis('GROS') d) x $$,
  $$ values ('minimum', 111000::bigint, 0::bigint) $$, 'sous le minimum (300 TND) : reconnu, il manque 111 TND');
select is((pg_temp.devis('GROS', 'tunis', null, 2) ->> 'remise_millimes')::bigint, 20000::bigint, 'deux valises : le minimum est atteint');
select results_eq($$ select (d ->> 'remise_millimes')::bigint, (d ->> 'total_millimes')::bigint from (select pg_temp.devis('ENORME') d) x $$,
  $$ values (189000::bigint, 6000::bigint) $$, 'un montant ne dépasse jamais les articles : restent les frais');
select is(pg_temp.devis('BIENTOT') #>> '{code,raison}', 'pas_encore', 'un code programmé attend son premier jour');
select is(pg_temp.devis('PASSE') #>> '{code,raison}', 'expire', 'un code fini ne vaut plus');

reset role;
update public.reglages set valeur = '"fixe"' where boutique_id = tests.id('A') and cle = 'livraison.mode_frais';
insert into public.reglages (boutique_id, cle, valeur) values (tests.id('A'), 'livraison.seuil_gratuite_millimes', '100000');
select tests.anonyme();
select is(pg_temp.devis('PORT') #>> '{code,raison}', 'offerte', 'livraison déjà offerte : le code n''apporte rien, il n''est pas consommé');
reset role;
delete from public.reglages where boutique_id = tests.id('A') and cle = 'livraison.seuil_gratuite_millimes';
update public.reglages set valeur = '"zone"' where boutique_id = tests.id('A') and cle = 'livraison.mode_frais';
insert into plateforme.modules_actifs (boutique_id, module) values (tests.id('A'), 'retrait_magasin');
insert into public.reglages (boutique_id, cle, valeur) values
  (tests.id('A'), 'retrait.adresse', '"12, avenue Habib-Bourguiba"'),
  (tests.id('A'), 'retrait.ville', '"Tunis"');
select tests.anonyme();
select is(pg_temp.devis('PORT', null, 'retrait') #>> '{code,raison}', 'retrait', 'au retrait (gratuit), la livraison offerte n''a rien à offrir');
select is((pg_temp.devis('BIENVENUE10', null, 'retrait') ->> 'total_millimes')::bigint, 170100::bigint, 'un pourcentage vaut aussi au retrait');

reset role;
select is(private.applique_code(tests.id('A'), '{"sous_total_millimes": 189000, "frais_livraison_millimes": 0, "total_millimes": 189000, "tarif": "devis"}',
                                'BIENVENUE10') #>> '{code,raison}', 'devis',
  'au tunnel d''un devis, aucun code : son prix est déjà négocié');

reset role; select tests.connecte('proprio_a');
select public.gestion_geste_code(tests.id('A'), pg_temp.id_code('BIENVENUE10'), 'couper');
reset role; select tests.anonyme();
select is(pg_temp.devis('BIENVENUE10') #>> '{code,raison}', 'coupe', 'un code coupé ne vaut plus');
reset role; select tests.connecte('proprio_a');
select public.gestion_geste_code(tests.id('A'), pg_temp.id_code('BIENVENUE10'), 'reactiver');
select is(tests.indice($$ select public.gestion_geste_code(tests.id('A'), pg_temp.id_code('BIENVENUE10'), 'reactiver') $$), 'etat',
  'réactiver un code actif : refusé');

-- ---------------------------------------------------------------------
-- La commande : le code gardé, ses limites
-- ---------------------------------------------------------------------
reset role;
insert into public.reglages (boutique_id, cle, valeur) values (tests.id('A'), 'compte.obligatoire', 'false');
-- Du stock pour les commandes du test (le jeu d'essai en réserve déjà deux).
select set_config('skanecom.ecriture_stock', 'on', true);
update public.variantes set stock = 50 where id = tests.id('variante_a');
select set_config('skanecom.ecriture_stock', '', true);
select tests.anonyme();
create temp table passees (nom text, r jsonb);
grant insert, select on passees to anon, authenticated;
insert into passees select 'a1', pg_temp.passe('a1', '20 100 001', 'BIENVENUE10', 176100);
reset role;
select is((select jsonb_build_object('remise', remise_millimes, 'code', code_promo, 'total', total_millimes, 'lie', code_promo_id = pg_temp.id_code('BIENVENUE10'))
             from public.commandes where boutique_id = tests.id('A') and numero = (select r ->> 'numero' from passees where nom = 'a1')),
  '{"remise": 18900, "code": "BIENVENUE10", "total": 176100, "lie": true}'::jsonb, 'la commande garde le code, la remise et le total remisé');

select tests.anonyme();
select is(tests.indice($$ select pg_temp.passe('a2', '20 100 001', 'BIENVENUE10', 176100) $$), 'code',
  'une fois par client : le même numéro, vu remisé, apprend pourquoi (pas « le total a changé »)');
insert into passees select 'a2', pg_temp.passe('a2', '20 100 001', 'BIENVENUE10', 195000);
reset role;
select is((select code_promo from public.commandes where boutique_id = tests.id('A') and numero = (select r ->> 'numero' from passees where nom = 'a2')),
  null, '… vu refusé, il commande sans le code');

select tests.anonyme();
insert into passees select 'u1', pg_temp.passe('u1', '20 100 002', 'une', 185000);
select is(tests.indice($$ select pg_temp.passe('u2', '20 100 003', 'UNE', 185000) $$), 'code', 'un code qui a servi autant que prévu : refusé');
reset role;
update public.commandes set statut = 'annulee', motif_annulation = 'Essai'
 where boutique_id = tests.id('A') and numero = (select r ->> 'numero' from passees where nom = 'u1');
select tests.anonyme();
insert into passees select 'u2', pg_temp.passe('u2', '20 100 003', 'UNE', 185000);
select is((select r ->> 'total_millimes' from passees where nom = 'u2'), '185000', 'une commande annulée rend son utilisation');

select is(public.commande_suivie(tests.id('A'), (select r ->> 'numero' from passees where nom = 'u2'), (select r ->> 'jeton' from passees where nom = 'u2')) ->> 'code_promo',
  'UNE', 'la page de fin lit le code de la commande');
reset role; select tests.connecte('confirm_a');
select is(public.gestion_commande(tests.id('A'), (select r ->> 'numero' from passees where nom = 'u2')) ->> 'code_promo', 'UNE',
  'l''équipe aussi, sur la fiche de la commande');

-- ---------------------------------------------------------------------
-- L'équipe : ce que les codes rapportent, ce qu'on peut encore changer
-- ---------------------------------------------------------------------
reset role; select tests.connecte('proprio_a');
select results_eq($$ select (c ->> 'utilisations')::integer, (c ->> 'remises_millimes')::bigint, (c ->> 'ventes_millimes')::bigint, c ->> 'etat'
                       from jsonb_array_elements(public.gestion_codes_promo(tests.id('A')) -> 'codes') c where c ->> 'code' = 'BIENVENUE10' $$,
  $$ values (1, 18900::bigint, 176100::bigint, 'actif') $$, 'BIENVENUE10 : une commande, 18,900 TND de remise, 176,100 TND de ventes');
select is((select c ->> 'etat' from jsonb_array_elements(public.gestion_codes_promo(tests.id('A')) -> 'codes') c where c ->> 'code' = 'UNE'), 'epuise',
  'UNE a servi autant que prévu : épuisé');
select results_eq($$ select c ->> 'etat', c ->> 'fin_jour' from jsonb_array_elements(public.gestion_codes_promo(tests.id('A')) -> 'codes') c where c ->> 'code' = 'PASSE' $$,
  $$ values ('termine', (current_date - 1)::text) $$, 'PASSE est terminé ; son dernier jour est celui saisi');
select is(tests.indice(format($$ select public.gestion_enregistrer_code(tests.id('A'), %L, 'BIENVENUE10', 'pourcentage', 20, 100000, null, null, null, true, null) $$,
                               pg_temp.id_code('BIENVENUE10'))), 'servi', 'un code qui a servi garde sa remise');
select is(public.gestion_enregistrer_code(tests.id('A'), pg_temp.id_code('BIENVENUE10'), 'BIENVENUE10', 'pourcentage', 10, 150000, null, current_date + 30, 500, true, 'Story')
            ->> 'code', 'BIENVENUE10', '… mais ses conditions se règlent encore');
select is(tests.indice(format($$ select public.gestion_geste_code(tests.id('A'), %L, 'retirer') $$, pg_temp.id_code('BIENVENUE10'))), 'servi',
  'un code qui a servi ne se retire pas : on le coupe');
select lives_ok(format($$ select public.gestion_geste_code(tests.id('A'), %L, 'retirer') $$, pg_temp.id_code('ENORME')), 'un code jamais servi se retire');
select ok(exists (select 1 from jsonb_array_elements(public.gestion_export(tests.id('A'), 'commandes')) l where l ->> 'code_promo' = 'BIENVENUE10'),
  'l''export des commandes porte le code');

select ok(has_function_privilege('anon', 'public.passer_commande(uuid, text, jsonb, jsonb, jsonb, bigint, text, text)', 'execute')
          and has_function_privilege('anon', 'public.devis_commande(uuid, jsonb, text, text, text)', 'execute')
          and not has_function_privilege('anon', 'private.applique_code(uuid, jsonb, text, uuid, text)', 'execute')
          and not has_function_privilege('authenticated', 'private.utilisations_code(uuid, uuid)', 'execute'),
  'la vitrine appelle le devis et la commande ; l''application des codes reste interne');

select * from finish();
rollback;
