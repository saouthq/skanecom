-- =====================================================================
-- 37 · La demande de devis : demander, chiffrer, accepter
-- =====================================================================
begin;
\ir outils.psql

select plan(64);

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

-- Une perceuse chez A (200 TND, 20 en stock) ; la valise noire (189 TND,
-- 3 en stock une fois réservées les commandes du jeu).
insert into public.variantes (id, boutique_id, produit_id, sku, options, prix_millimes, stock, actif) values
  (tests.nouvel_id('perceuse'), tests.id('A'), tests.id('produit_a'), 'PERC-18', '{"couleur": "Jaune"}', 200000, 20, true);

create function pg_temp.panier() returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('variante_id', tests.id('perceuse'), 'quantite', 10),
                           jsonb_build_object('variante_id', tests.id('variante_a'), 'quantite', 2))
$$;
create function pg_temp.demande(p_message text default 'Chantier à Sfax, livraison sous quinze jours') returns jsonb language sql as $$
  select public.demander_devis(tests.id('A'), pg_temp.panier(), p_message)
$$;
create function pg_temp.id_devis(p_numero text) returns uuid language sql as $$
  select id from public.devis where boutique_id = tests.id('A') and numero = p_numero
$$;
create function pg_temp.lignes(p_numero text) returns jsonb language sql as $$
  select jsonb_object_agg(l.id, case l.sku when 'PERC-18' then 170000 else 180000 end)
    from public.devis_lignes l join public.devis d on d.id = l.devis_id where d.boutique_id = tests.id('A') and d.numero = p_numero
$$;
create function pg_temp.chiffre(p_numero text, p_envoyer boolean default true, p_frais bigint default 0, p_prix jsonb default null) returns void
language sql as $$
  select public.gestion_chiffrer_devis(tests.id('A'), p_numero, coalesce(p_prix, pg_temp.lignes(p_numero)), p_frais, 10,
                                       'Prix pour 10 perceuses, livraison offerte', p_envoyer)
$$;
create function pg_temp.accepte(p_numero text, p_cle text) returns jsonb language sql as $$
  select public.accepter_devis(tests.id('A'), p_numero, p_cle,
    jsonb_build_object('nom', 'Client A', 'telephone', '20 000 001', 'accepte_conditions', true),
    jsonb_build_object('ligne1', '1 rue de Rome', 'ville', 'Tunis', 'gouvernorat', 'tunis'))
$$;
create function pg_temp.mien(p_numero text) returns jsonb language sql as $$
  select x from jsonb_array_elements(public.mes_devis(tests.id('A'))) x where x ->> 'numero' = p_numero
$$;

-- ---------------------------------------------------------------------
-- Module coupé, puis la demande
-- ---------------------------------------------------------------------
reset role; select tests.connecte('client_a');
select is(tests.indice($$ select pg_temp.demande() $$), 'module', 'module coupé : pas de devis');

reset role;
insert into plateforme.modules_actifs (boutique_id, module) values (tests.id('A'), 'devis');
select results_eq($$ select code, disponible from plateforme.modules where code in ('devis', 'sav') order by code $$,
  $$ values ('devis'::text, true), ('sav', true) $$, 'les modules devis et sav sont disponibles à la console');

reset role; select tests.anonyme();
select throws_ok($$ select pg_temp.demande() $$, '42501', null, 'un visiteur sans compte ne demande rien');
select is(tests.indice($$ select public.chiffre_devis(tests.id('A'), 'DEV-00001') $$), 'compte', '… et le lien d''un devis lui dit de se connecter');
select throws_ok(format($$ select public.accepter_devis(%L, 'DEV-00001', 'cle-anonyme-00000001', '{}', '{}') $$, tests.id('A')),
                 '42501', null, '… sans pouvoir l''accepter');

reset role; select tests.connecte('client_a');
select is(tests.indice(format($$ select public.demander_devis(%L, '[]') $$, tests.id('A'))), 'panier', 'un panier vide : non');
select is(tests.indice(format($$ select public.demander_devis(%L, '[{"variante_id": "%s", "quantite": 1}]') $$, tests.id('A'), tests.id('variante_a_brouillon'))),
  'panier', 'un article hors vente (brouillon) : non');
select is(tests.indice(format($$ select pg_temp.demande(%L) $$, repeat('x', 1001))), 'message', 'un message de plus de 1 000 caractères : non');
select is(pg_temp.demande() ->> 'numero', 'DEV-00001', 'le client connecté demande un devis : DEV-00001');
select results_eq($$ select x ->> 'statut', jsonb_array_length(x -> 'lignes'), x -> 'lignes' -> 0 ->> 'prix_millimes', x ->> 'total_millimes'
                       from (select pg_temp.mien('DEV-00001') x) q $$,
  $$ values ('demande'::text, 2, null::text, null::text) $$, 'il le lit : en attente, deux lignes, aucun prix encore');
select is((select count(*)::int from public.devis) + (select count(*)::int from public.devis_lignes), 0,
  'il ne lit pas les tables (seulement sa fonction)');
select throws_ok(format($$ insert into public.devis (boutique_id, rang, numero, client_id) values (%L, 99, 'DEV-00099', %L) $$,
                        tests.id('A'), tests.id('fiche_client_a')), '42501', null, '… ni n''y écrit');
reset role; select tests.connecte('client_ab');
select is(jsonb_array_length(public.mes_devis(tests.id('A'))), 0, 'un autre client ne voit pas ce devis');
select is(tests.indice($$ select public.chiffre_devis(tests.id('A'), 'DEV-00001') $$), 'devis', '… ni ne le chiffre');

-- ---------------------------------------------------------------------
-- Le backoffice : voir, chiffrer, envoyer
-- ---------------------------------------------------------------------
reset role; select tests.connecte('lecture_a');
select is((public.gestion_devis_etat(tests.id('A')) ->> 'a_chiffrer')::int, 1, 'l''équipe voit un devis à chiffrer');
select results_eq($$ select d ->> 'numero', (d ->> 'pieces')::int, (d ->> 'catalogue_millimes')::bigint
                       from jsonb_array_elements(public.gestion_liste_devis(tests.id('A')) -> 'devis') d $$,
  $$ values ('DEV-00001'::text, 12, 2378000::bigint) $$, 'la liste : 12 pièces, 2 378 TND au catalogue');
select results_eq($$ select l ->> 'sku', (l ->> 'stock')::int, (l ->> 'prix_catalogue_millimes')::bigint
                       from jsonb_array_elements(public.gestion_devis(tests.id('A'), 'DEV-00001') -> 'lignes') l $$,
  $$ values ('PERC-18'::text, 20, 200000::bigint), ('VAL-55-NOIR', 3, 189000) $$, 'la fiche : chaque ligne, son stock, son prix catalogue');
select is(tests.indice($$ select pg_temp.chiffre('DEV-00001') $$), 'role', 'la lecture ne chiffre pas');
reset role; select tests.connecte('confirm_a');
select is(tests.indice($$ select pg_temp.chiffre('DEV-00001') $$), 'role', 'la confirmation non plus (c''est un prix)');
reset role; select tests.connecte('proprio_b');
select throws_ok($$ select public.gestion_devis(tests.id('A'), 'DEV-00001') $$, '42501', null, 'une autre boutique ne voit rien');

reset role; select tests.connecte('proprio_a');
select is(tests.indice($$ select pg_temp.chiffre('DEV-00001', true, 0, '{}'::jsonb) $$), 'incomplet', 'envoyer sans chiffrer chaque ligne : non');
select is(tests.indice(format($$ select pg_temp.chiffre('DEV-00001', false, 0, '{"%s": 1000}'::jsonb) $$, tests.id('variante_a'))), 'prix',
  'un prix pour une ligne d''un autre devis : non');
select is(tests.indice($$ select pg_temp.chiffre('DEV-00001', false, 0, (select jsonb_object_agg(k, -5) from jsonb_object_keys(pg_temp.lignes('DEV-00001')) k)) $$),
  'prix', 'un prix négatif : non');
select is(tests.indice(format($$ select public.gestion_chiffrer_devis(%L, 'DEV-00001', '{}', 0, 91, null, false) $$, tests.id('A'))), 'validite',
  'une validité de plus de 90 jours : non');
select is(tests.indice(format($$ select public.gestion_chiffrer_devis(%L, 'DEV-00001', '{}', 0, 10, null, false, now() - interval '1 day') $$, tests.id('A'))),
  'change', 'un devis modifié entre-temps : la version vue est revérifiée');
select lives_ok($$ select pg_temp.chiffre('DEV-00001') $$, 'la propriétaire chiffre (170 et 180 TND), offre la livraison et envoie');
reset role;
select results_eq($$ select statut, valide_jusqu_au - (now() at time zone 'Africa/Tunis')::date, frais_livraison_millimes from public.devis where boutique_id = tests.id('A') and numero = 'DEV-00001' $$,
  $$ values ('envoye'::text, 10, 0::bigint) $$, 'envoyé, valable dix jours, livraison offerte');
select results_eq($$ select action, (apres ->> 'total')::bigint from plateforme.journal_audit where boutique_id = tests.id('A') and cible = 'DEV-00001' $$,
  $$ values ('devis.envoyer'::text, 2060000::bigint) $$, 'l''envoi passe au journal, avec son total');

-- ---------------------------------------------------------------------
-- Le client lit, chiffre, accepte
-- ---------------------------------------------------------------------
reset role; select tests.connecte('client_a');
select results_eq($$ select x ->> 'statut', (x ->> 'total_millimes')::bigint, x ->> 'note', (x -> 'lignes' -> 0 ->> 'prix_millimes')::bigint
                       from (select pg_temp.mien('DEV-00001') x) q $$,
  $$ values ('envoye'::text, 2060000::bigint, 'Prix pour 10 perceuses, livraison offerte'::text, 170000::bigint) $$,
  'il lit les prix du devis, le total, la note de la boutique');
select results_eq($$ select d ->> 'tarif', (d ->> 'complet')::boolean, (d ->> 'sous_total_millimes')::bigint,
                            (d ->> 'frais_livraison_millimes')::bigint, (d ->> 'total_millimes')::bigint
                       from (select public.chiffre_devis(tests.id('A'), 'DEV-00001', 'tunis') d) q $$,
  $$ values ('devis'::text, true, 2060000::bigint, 0::bigint, 2060000::bigint) $$, 'le tunnel chiffre au devis : ses prix, ses frais');
select is(public.devis_commande(tests.id('A'), pg_temp.panier(), 'tunis') ->> 'tarif', 'public',
  'le même panier hors devis : le prix public (le devis ne fuit pas)');
select ok((select (r ->> 'numero') is not null from (select pg_temp.accepte('DEV-00001', 'essai-devis-accepte-000001') r) q),
  'il accepte : la commande naît');
reset role;
select results_eq($$ select l.sku, l.prix_unitaire_millimes, l.quantite from public.commande_lignes l
                      join public.commandes c on c.id = l.commande_id where c.cle_idempotence = 'essai-devis-accepte-000001' order by l.sku $$,
  $$ values ('PERC-18'::text, 170000::bigint, 10), ('VAL-55-NOIR', 180000, 2) $$, 'la commande garde les prix du devis');
select results_eq($$ select c.total_millimes, c.frais_livraison_millimes, c.statut::text, c.note_client from public.commandes c
                      where c.cle_idempotence = 'essai-devis-accepte-000001' $$,
  $$ values (2060000::bigint, 0::bigint, 'recue'::text, 'Devis DEV-00001 accepté'::text) $$,
  'son total, ses frais, elle attend l''appel de confirmation, elle dit d''où elle vient');
select is((select stock from public.variantes where id = tests.id('perceuse')), 10, 'le stock est réservé à la commande (20 − 10)');
select results_eq($$ select d.statut, c.cle_idempotence from public.devis d join public.commandes c on c.id = d.commande_id
                      where d.boutique_id = tests.id('A') and d.numero = 'DEV-00001' $$,
  $$ values ('accepte'::text, 'essai-devis-accepte-000001'::text) $$, 'le devis est accepté, relié à sa commande');
reset role; select tests.connecte('client_a');
select ok(pg_temp.mien('DEV-00001') ->> 'commande' ~ '^MAY-[0-9]{4}-[0-9]{5}$', '« Mes commandes » : le devis mène à sa commande (son numéro)');
select is(tests.indice($$ select pg_temp.accepte('DEV-00001', 'essai-devis-accepte-000002') $$), 'deja', 'un devis ne s''accepte qu''une fois');

-- ---------------------------------------------------------------------
-- Le chiffrage désigné par la transaction : jamais le devis d'un autre
-- ---------------------------------------------------------------------
select is(pg_temp.demande('Deuxième chantier') ->> 'numero', 'DEV-00002', 'un deuxième devis');
reset role; select tests.connecte('proprio_a');
select lives_ok($$ select pg_temp.chiffre('DEV-00002') $$, 'chiffré et envoyé');
reset role; select tests.connecte('client_ab');
select is(tests.indice($$ select public.chiffre_devis(tests.id('A'), 'DEV-00002', 'tunis') $$), 'devis', 'un autre client ne chiffre pas un devis envoyé…');
select is(tests.indice($$ select pg_temp.accepte('DEV-00002', 'essai-devis-autrui-000001') $$), 'devis', '… ni ne l''accepte');
-- Le devis désigné directement à la transaction (le superutilisateur le lit,
-- puis le rôle change : le réglage de transaction demeure).
reset role; select set_config('skanecom.devis_id', pg_temp.id_devis('DEV-00002')::text, true); select tests.connecte('client_ab');
select is(public.devis_commande(tests.id('A'), pg_temp.panier(), 'tunis') ->> 'tarif', 'public',
  'un autre client qui désignerait ce devis reste au prix public');
reset role; select tests.connecte('client_a');
select is(public.devis_commande(tests.id('A'), pg_temp.panier(), 'tunis') ->> 'tarif', 'devis',
  'désigné pour son client, le devis chiffre à ses prix (témoin)');
select is((public.devis_commande(tests.id('A'), jsonb_build_array(jsonb_build_object('variante_id', tests.id('perceuse'), 'quantite', 5)), 'tunis') ->> 'complet')::boolean,
  false, '… et n''accepte que ses propres lignes et quantités');
reset role; select set_config('skanecom.devis_id', pg_temp.id_devis('DEV-00001')::text, true); select tests.connecte('client_a');
select is(public.devis_commande(tests.id('A'), pg_temp.panier(), 'tunis') ->> 'tarif', 'public',
  'un devis déjà accepté ne chiffre plus rien');
reset role; select set_config('skanecom.devis_id', '', true);
reset role; select tests.connecte('client_a');
select is(tests.indice($$ select pg_temp.accepte('DEV-00002', 'essai-devis-stock-0000001') $$), 'stock',
  'plus assez de valises en stock (1 pour 2) : l''acceptation est refusée, rien ne passe');
reset role;
select is((select statut from public.devis where boutique_id = tests.id('A') and numero = 'DEV-00002'), 'envoye', '… et le devis reste envoyé');

-- Les frais laissés à la boutique : ceux de la zone, au moment de la commande.
reset role; select tests.connecte('proprio_a');
select lives_ok($$ select pg_temp.chiffre('DEV-00002', true, null) $$, 'rechiffré, frais laissés à la boutique');
reset role; select tests.connecte('client_a');
select is((select (r ->> 'frais_livraison_millimes')::bigint = public.frais_livraison_millimes(tests.id('A'), 'tunis', 2060000, (r ->> 'poids_grammes')::integer)
                    and r ->> 'tarif' = 'devis'
               from (select public.chiffre_devis(tests.id('A'), 'DEV-00002', 'tunis') r) q), true,
  'les frais de la zone s''appliquent, au tarif du devis');

-- ---------------------------------------------------------------------
-- Expiré, refusé, annulé, trop, bloqué
-- ---------------------------------------------------------------------
reset role;
update public.devis set valide_jusqu_au = (now() at time zone 'Africa/Tunis')::date - 1 where boutique_id = tests.id('A') and numero = 'DEV-00002';
reset role; select tests.connecte('client_a');
select is(tests.indice($$ select public.chiffre_devis(tests.id('A'), 'DEV-00002', 'tunis') $$), 'expire', 'un devis dont la validité est passée ne s''accepte plus');
select is(pg_temp.mien('DEV-00002') ->> 'statut', 'expire', '… et se lit « expiré »');
reset role; select tests.connecte('lecture_a');
select is((public.gestion_liste_devis(tests.id('A'), 'clos') -> 'compteurs' ->> 'clos')::int, 1, 'au backoffice, parmi les clos');

reset role; select tests.connecte('client_a');
select is(pg_temp.demande('Troisième') ->> 'numero', 'DEV-00003', 'un troisième devis');
reset role; select tests.connecte('proprio_a');
select lives_ok($$ select pg_temp.chiffre('DEV-00003', false) $$, 'la boutique le chiffre en brouillon, sans l''envoyer');
reset role; select tests.connecte('client_a');
select is(pg_temp.mien('DEV-00003') -> 'lignes' -> 0 ->> 'prix_millimes', null, 'un brouillon ne montre aucun prix au client');
select lives_ok($$ select public.refuser_devis(tests.id('A'), 'DEV-00003', 'Trouvé moins cher') $$, 'le client peut le retirer');
select is(tests.indice($$ select public.refuser_devis(tests.id('A'), 'DEV-00003') $$), 'devis', '… une fois');

select is(pg_temp.demande('Quatrième') ->> 'numero', 'DEV-00004', 'un quatrième');
reset role; select tests.connecte('proprio_a');
select is(tests.indice($$ select public.gestion_annuler_devis(tests.id('A'), 'DEV-00004', '') $$), 'motif', 'annuler dit pourquoi');
select lives_ok($$ select public.gestion_annuler_devis(tests.id('A'), 'DEV-00004', 'Article plus fabriqué') $$, 'la boutique annule un devis');
reset role; select tests.connecte('client_a');
select results_eq($$ select x ->> 'statut', x ->> 'motif' from (select pg_temp.mien('DEV-00004') x) q $$,
  $$ values ('annule'::text, 'Article plus fabriqué'::text) $$, 'le client lit l''annulation et son motif');

do $$ begin perform pg_temp.demande('Cinq'); perform pg_temp.demande('Six'); perform pg_temp.demande('Sept'); end $$;
select is(tests.indice($$ select pg_temp.demande('Huit') $$), 'trop', 'trois devis en cours : un quatrième attend');
reset role;
update public.clients set niveau_risque = 'bloque' where id = tests.id('fiche_client_ab_a');
reset role; select tests.connecte('client_ab');
select is(tests.indice($$ select pg_temp.demande() $$), 'bloque', 'un client bloqué ne demande pas de devis');

select * from finish();
rollback;
