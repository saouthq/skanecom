-- =====================================================================
-- 88 · Les précommandes sur arrivage
-- =====================================================================
begin;
\ir outils.psql

select plan(45);

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

-- La valise de A en rouge et en vert : épuisées (189,000).
insert into public.variantes (id, boutique_id, produit_id, sku, options, prix_millimes, stock, actif) values
  (tests.nouvel_id('rouge'), tests.id('A'), tests.id('produit_a'), 'VAL-55-ROUGE', '{"couleur": "Rouge"}', 189000, 0, true),
  (tests.nouvel_id('vert'),  tests.id('A'), tests.id('produit_a'), 'VAL-55-VERT',  '{"couleur": "Vert"}',  189000, 0, true);
insert into public.reglages (boutique_id, cle, valeur) values (tests.id('A'), 'compte.obligatoire', 'false');

create function pg_temp.panier(p_variante text, p_q integer) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('variante_id', tests.id(p_variante), 'quantite', p_q))
$$;
create function pg_temp.devis(p_variante text, p_q integer) returns jsonb language sql as $$
  select public.devis_commande(tests.id('A'), pg_temp.panier(p_variante, p_q), 'tunis', null, null)
$$;
create function pg_temp.commande(p_cle text, p_tel text, p_variante text, p_q integer) returns jsonb language sql as $$
  select public.passer_commande(tests.id('A'), 'essai-pre-' || p_cle || '-0000000000', pg_temp.panier(p_variante, p_q),
    jsonb_build_object('nom', 'Client ' || p_cle, 'telephone', p_tel, 'accepte_conditions', true),
    jsonb_build_object('ligne1', '5 rue de Marseille', 'ville', 'Tunis', 'gouvernorat', 'tunis'),
    (pg_temp.devis(p_variante, p_q) ->> 'total_millimes')::bigint, null, null)
$$;
create function pg_temp.stock(p_variante text) returns integer language sql as $$
  select stock from public.variantes where id = tests.id(p_variante)
$$;
create function pg_temp.lignes(p_variante text, p_q integer) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('variante_id', tests.id(p_variante), 'quantite', p_q))
$$;
grant execute on all functions in schema pg_temp to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- Réglage coupé : une pièce épuisée ne se commande pas
-- ---------------------------------------------------------------------
reset role; select tests.connecte('proprio_a');
select ok((public.gestion_enregistrer_arrivage(tests.id('A'), null, 'Conteneur d''octobre', current_date + 10,
             pg_temp.lignes('rouge', 5), 'Le conteneur de Gênes') ->> 'id') is not null,
  'l''arrivage s''annonce (le réglage coupé n''empêche pas de le préparer)');
reset role; select tests.anonyme();
select results_eq($$ select (pg_temp.devis('rouge', 1) ->> 'complet')::boolean, pg_temp.devis('rouge', 1) #> '{lignes,0,precommande}' $$,
  $$ values (false, 'null'::jsonb) $$, 'réglage coupé : la pièce épuisée ne se commande pas, même annoncée');

reset role;
insert into public.reglages (boutique_id, cle, valeur) values (tests.id('A'), 'catalogue.precommandes', 'true');

-- ---------------------------------------------------------------------
-- Annoncer : les rôles, la forme
-- ---------------------------------------------------------------------
select tests.connecte('lecture_a');
select throws_ok(format($$ select public.gestion_enregistrer_arrivage(%L, null, 'Conteneur', current_date + 5, %L) $$, tests.id('A'), pg_temp.lignes('vert', 3)),
  '42501', null, 'la lecture seule n''annonce pas d''arrivage');
reset role; select tests.connecte('proprio_b');
select throws_ok(format($$ select public.gestion_enregistrer_arrivage(%L, null, 'Conteneur', current_date + 5, %L) $$, tests.id('A'), pg_temp.lignes('vert', 3)),
  '42501', null, 'une autre boutique non plus');
reset role; select tests.connecte('prepa_a');
select is(tests.indice(format($$ select public.gestion_enregistrer_arrivage(%L, null, 'Conteneur', current_date - 1, %L) $$, tests.id('A'), pg_temp.lignes('vert', 3))),
  'date', 'un arrivage annoncé pour hier : refusé');
select is(tests.indice(format($$ select public.gestion_enregistrer_arrivage(%L, null, 'C', current_date + 5, %L) $$, tests.id('A'), pg_temp.lignes('vert', 3))),
  'nom', 'un nom d''une lettre : refusé');
select is(tests.indice(format($$ select public.gestion_enregistrer_arrivage(%L, null, 'Conteneur', current_date + 5, %L) $$, tests.id('A'), pg_temp.lignes('vert', 0))),
  'quantite', 'une quantité nulle : refusée');
select is(tests.indice(format($$ select public.gestion_enregistrer_arrivage(%L, null, 'Conteneur', current_date + 5, %L) $$, tests.id('A'),
             pg_temp.lignes('vert', 3) || pg_temp.lignes('vert', 2))),
  'double', 'la même déclinaison deux fois : refusée');
select is(tests.indice(format($$ select public.gestion_enregistrer_arrivage(%L, null, 'Conteneur', current_date + 5, %L) $$, tests.id('A'),
             jsonb_build_array(jsonb_build_object('variante_id', tests.id('variante_b'), 'quantite', 3)))),
  'variante', 'une déclinaison d''une autre boutique : refusée');

-- ---------------------------------------------------------------------
-- La vitrine propose la précommande, dans la limite de ce qui arrive
-- ---------------------------------------------------------------------
reset role; select tests.anonyme();
select results_eq($$ select (d ->> 'complet')::boolean, (d #>> '{lignes,0,disponible}')::boolean, (d #>> '{lignes,0,precommande,date_prevue}')::date,
                            (d #>> '{precommande,date_prevue}')::date from (select pg_temp.devis('rouge', 2) as d) x $$,
  $$ values (true, true, current_date + 10, current_date + 10) $$,
  'deux valises rouges, épuisées : en précommande, arrivée prévue dans dix jours');
select results_eq($$ select (d ->> 'complet')::boolean, (d #>> '{lignes,0,quantite_disponible}')::integer from (select pg_temp.devis('rouge', 6) as d) x $$,
  $$ values (false, 5) $$, 'six quand il en arrive cinq : refusé, cinq au plus');
select is((select (v -> 'precommande' ->> 'reste')::integer from public.vitrine_produits p, jsonb_array_elements(p.variantes) v
            where p.boutique_id = tests.id('A') and v ->> 'sku' = 'VAL-55-ROUGE'), 5,
  'la fiche le sait : cinq à précommander');
select is((select v -> 'precommande' from public.vitrine_produits p, jsonb_array_elements(p.variantes) v
            where p.boutique_id = tests.id('A') and v ->> 'sku' = 'VAL-55-NOIR'), 'null'::jsonb,
  'une déclinaison en stock : rien à précommander');
select is((select count(*)::integer from public.arrivages), 0, 'les arrivages ne se lisent pas depuis la vitrine');

-- ---------------------------------------------------------------------
-- Précommander : rien ne sort du stock, la commande attend
-- ---------------------------------------------------------------------
select ok((pg_temp.commande('1', '+21655300001', 'rouge', 2) ->> 'numero') is not null, 'deux valises rouges précommandées');
reset role;
select results_eq($$ select c.en_attente_arrivage, l.precommande, l.precommande_arrivage_id is not null, l.precommande_servie_le is null, pg_temp.stock('rouge')
                       from public.commandes c join public.commande_lignes l on l.commande_id = c.id
                      where c.cle_idempotence = 'essai-pre-1-0000000000' $$,
  $$ values (true, true, true, true, 0) $$,
  'la commande attend son arrivage, la ligne en précommande ; le stock reste à 0');
select is((select count(*)::integer from public.stock_mouvements where variante_id = tests.id('rouge')), 0, 'aucun mouvement de stock');
select results_eq($$ select a ->> 'arrivage_prevu', (a #>> '{lignes,0,precommande}')::boolean
                       from (select private.commande_pour_acheteur(c.boutique_id, c.id) as a from public.commandes c
                              where c.cle_idempotence = 'essai-pre-1-0000000000') x $$,
  $$ values ((current_date + 10)::text, true) $$,
  'son compte et le suivi le disent : précommande, arrivée prévue dans dix jours');
select tests.anonyme();
select is((select (v -> 'precommande' ->> 'reste')::integer from public.vitrine_produits p, jsonb_array_elements(p.variantes) v
            where p.boutique_id = tests.id('A') and v ->> 'sku' = 'VAL-55-ROUGE'), 3, 'il en reste trois à précommander');
select ok((pg_temp.commande('2', '+21655300002', 'rouge', 3) ->> 'numero') is not null, 'trois de plus');
select is((select v -> 'precommande' from public.vitrine_produits p, jsonb_array_elements(p.variantes) v
            where p.boutique_id = tests.id('A') and v ->> 'sku' = 'VAL-55-ROUGE'), 'null'::jsonb,
  'l''arrivage est tout précommandé : la fiche ne le propose plus');
select is(tests.indice($$ select pg_temp.commande('3', '+21655300003', 'rouge', 1) $$), 'stock', 'une de plus : refusée (il n''en arrive que cinq)');

-- ---------------------------------------------------------------------
-- Elle ne part pas tant que ses pièces ne sont pas là
-- ---------------------------------------------------------------------
reset role;
update public.commandes set statut = 'confirmee' where cle_idempotence in ('essai-pre-1-0000000000', 'essai-pre-2-0000000000');
select tests.connecte('prepa_a');
select is(tests.indice(format($$ select public.gestion_expedier(%L, %L, 'confirmee') $$, tests.id('A'),
             (select numero from public.commandes where cle_idempotence = 'essai-pre-1-0000000000'))),
  'arrivage', 'confirmée, elle ne s''expédie pas : elle attend son arrivage');
select is(jsonb_array_length(public.gestion_expedier_lot(tests.id('A'),
             array[(select numero from public.commandes where cle_idempotence = 'essai-pre-1-0000000000')]) -> 'ignorees'), 1,
  'remise au livreur d''un geste : laissée de côté');
select results_eq($$ select (l ->> 'total')::integer, (l #>> '{compteurs,precommandes}')::integer, (l #>> '{compteurs,a_preparer}')::integer,
                            l #>> '{commandes,0,arrivage_prevu}'
                       from (select public.gestion_liste_commandes(tests.id('A'), 'precommandes') as l) x $$,
  $$ values (2, 2, 0, (current_date + 10)::text) $$,
  'la liste les range dans « Précommandes », pas dans « À préparer », avec leur date d''arrivée');
select is((public.gestion_aujourdhui(tests.id('A')) #>> '{commandes,precommandes}')::integer, 2, '« Aujourd''hui » les compte à part');

-- Annulée : elle n'avait rien pris, elle ne rend rien.
reset role;
update public.commandes set statut = 'annulee', motif_annulation = 'Le client ne veut plus attendre'
 where cle_idempotence = 'essai-pre-2-0000000000';
select is(pg_temp.stock('rouge'), 0, 'une précommande annulée ne rend pas de stock qu''elle n''a jamais pris');
select is((select en_attente_arrivage from public.commandes where cle_idempotence = 'essai-pre-2-0000000000'), false,
  'annulée, elle n''attend plus d''arrivage');
select is(private.capacite_precommande(tests.id('A'), tests.id('rouge')), 3, 'ses trois valises redeviennent précommandables');

-- ---------------------------------------------------------------------
-- La réception sert d'abord les précommandes
-- ---------------------------------------------------------------------
select tests.connecte('prepa_a');
select results_eq($$ select (r ->> 'pieces')::integer, jsonb_array_length(r -> 'servies'), (r ->> 'en_attente')::integer
                       from (select public.gestion_recevoir_arrivage(tests.id('A'),
                               (select id from public.arrivages where nom = 'Conteneur d''octobre'), pg_temp.lignes('rouge', 4)) as r) x $$,
  $$ values (4, 1, 0) $$,
  'quatre valises reçues : la précommande est servie, plus rien n''attend');
reset role;
select results_eq($$ select pg_temp.stock('rouge'), c.en_attente_arrivage, l.precommande_servie_le is not null
                       from public.commandes c join public.commande_lignes l on l.commande_id = c.id
                      where c.cle_idempotence = 'essai-pre-1-0000000000' $$,
  $$ values (2, false, true) $$,
  'deux lui sont réservées, deux restent en stock ; la commande n''attend plus');
select ok(exists (select 1 from public.stock_mouvements m join public.commandes c on c.id = m.commande_id
                   where m.variante_id = tests.id('rouge') and m.delta = -2 and m.motif = 'vente'
                     and m.commentaire = 'Précommande ' || c.numero and c.cle_idempotence = 'essai-pre-1-0000000000'),
  'au journal du stock : « Précommande MAY-… », −2');
select is((select statut from public.arrivages where nom = 'Conteneur d''octobre'), 'recu', 'l''arrivage est reçu');
select tests.connecte('prepa_a');
select lives_ok(format($$ select public.gestion_expedier(%L, %L, 'confirmee') $$, tests.id('A'),
             (select numero from public.commandes where cle_idempotence = 'essai-pre-1-0000000000')),
  'servie, elle part');
select is(tests.indice(format($$ select public.gestion_recevoir_arrivage(%L, %L, %L) $$, tests.id('A'),
             (select id from public.arrivages where nom = 'Conteneur d''octobre'), pg_temp.lignes('rouge', 1))),
  'etat', 'un arrivage reçu ne se reçoit pas deux fois');

-- ---------------------------------------------------------------------
-- Dans l'ordre des commandes ; celle que le stock ne couvre pas attend
-- ---------------------------------------------------------------------
select ok((public.gestion_enregistrer_arrivage(tests.id('A'), null, 'Le camion du 12', current_date + 3, pg_temp.lignes('vert', 10)) ->> 'id') is not null,
  'un arrivage de dix valises vertes');
reset role; select tests.anonyme();
select pg_temp.commande('4', '+21655300004', 'vert', 3);
select pg_temp.commande('5', '+21655300005', 'vert', 1);
reset role; select tests.connecte('prepa_a');
select is(public.mouvement_stock(tests.id('A'), tests.id('vert'), 2, 'correction', 'Deux retrouvées en réserve'), 1,
  'deux valises retrouvées : la première commande (trois) attend, la suivante (une) est servie ; il en reste une');
reset role;
select results_eq($$ select c.cle_idempotence, c.en_attente_arrivage from public.commandes c
                      where c.cle_idempotence in ('essai-pre-4-0000000000', 'essai-pre-5-0000000000') order by 1 $$,
  $$ values ('essai-pre-4-0000000000', true), ('essai-pre-5-0000000000', false) $$,
  'la première attend encore, la seconde est servie');
select tests.connecte('prepa_a');
select is(public.mouvement_stock(tests.id('A'), tests.id('vert'), 2, 'reception', 'Le reste'), 0,
  'deux de plus : la première commande a ses trois, le stock retombe à 0');

-- ---------------------------------------------------------------------
-- Ni au comptoir, ni sur un arrivage annulé
-- ---------------------------------------------------------------------
reset role; select tests.connecte('proprio_a');
select is(tests.indice(format($$ select public.gestion_saisir_commande(%L, 'essai-pre-comptoir-000000', 'magasin',
             '{"nom": "Client du magasin", "telephone": "55300006"}', %L, '{"mode": "comptoir"}', '{}', true, null, 189000) $$,
             tests.id('A'), pg_temp.panier('vert', 1))),
  'precommande', 'au comptoir, une pièce pas encore arrivée ne se remet pas');
select ok((public.gestion_annuler_arrivage(tests.id('A'), (select id from public.arrivages where nom = 'Le camion du 12')) ->> 'nom') = 'Le camion du 12',
  'l''arrivage est annulé');
reset role; select tests.anonyme();
select is((pg_temp.devis('vert', 1) ->> 'complet')::boolean, false, 'annulé : plus rien ne se précommande');

reset role; select tests.connecte('proprio_a');
select results_eq($$ select a ->> 'nom', a ->> 'statut', (a #>> '{lignes,0,quantite}')::integer
                       from jsonb_array_elements(public.gestion_arrivages(tests.id('A')) -> 'arrivages') a order by a ->> 'nom' $$,
  $$ values ('Conteneur d''octobre', 'recu', 5), ('Le camion du 12', 'annule', 10) $$,
  'l''écran des arrivages : le reçu, l''annulé');

-- ---------------------------------------------------------------------
-- Une commande annulée rend son stock : il sert d'abord la précommande
-- ---------------------------------------------------------------------
reset role; select tests.connecte('prepa_a');
select public.mouvement_stock(tests.id('A'), tests.id('vert'), 1, 'correction', 'Une de retour');
reset role; select tests.anonyme();
select pg_temp.commande('7', '+21655300007', 'vert', 1);
reset role; select tests.connecte('prepa_a');
select public.gestion_enregistrer_arrivage(tests.id('A'), null, 'Le camion du 20', current_date + 8, pg_temp.lignes('vert', 5));
reset role; select tests.anonyme();
select pg_temp.commande('8', '+21655300008', 'vert', 1);
reset role;
update public.commandes set statut = 'annulee', motif_annulation = 'Le client a trouvé ailleurs'
 where cle_idempotence = 'essai-pre-7-0000000000';
select results_eq($$ select pg_temp.stock('vert'), c.en_attente_arrivage from public.commandes c
                      where c.cle_idempotence = 'essai-pre-8-0000000000' $$,
  $$ values (0, false) $$,
  'la valise que rend la commande annulée part à la précommande qui attendait');
select ok(exists (select 1 from public.stock_mouvements m join public.commandes c on c.id = m.commande_id
                   where m.variante_id = tests.id('vert') and m.delta = -1 and m.commentaire = 'Précommande ' || c.numero
                     and c.cle_idempotence = 'essai-pre-8-0000000000'),
  'au journal : le retour, puis la précommande servie');

select * from finish();
rollback;
