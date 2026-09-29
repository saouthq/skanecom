-- =====================================================================
-- 11 · Backoffice : le cycle de commande par l'équipe de la boutique
-- (appels, confirmation, annulation, expédition, livraison, refus,
-- note interne), rôles, étape attendue, liste et fiche
-- =====================================================================
begin;
\ir outils.psql

select plan(39);

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

-- Les numéros des commandes du jeu d'essai.
create temp view n as
  select (select numero from public.commandes where id = tests.id('commande_a'))    as a,
         (select numero from public.commandes where id = tests.id('commande_ab_a')) as ab,
         (select numero from public.commandes where id = tests.id('commande_ab_b')) as b;
grant select on n to anon, authenticated;


-- ---------------------------------------------------------------------
-- Liste et fiche : l'équipe de la boutique, et elle seule
-- ---------------------------------------------------------------------
reset role; select tests.connecte('lecture_a');
select ok((
  with l as (select public.gestion_liste_commandes(tests.id('A')) as r)
  select (r -> 'compteurs' ->> 'a_confirmer')::int = 2 and jsonb_array_length(r -> 'commandes') = 2
     and (r ->> 'total')::int = 2 from l),
  'la liste « à confirmer » donne les deux commandes reçues de A, et les compteurs');
select ok((
  with l as (select public.gestion_liste_commandes(tests.id('A')) as r)
  select (r -> 'commandes' -> 0 ->> 'numero') = (select a from n)
     and (r -> 'commandes' -> 0 ->> 'articles')::int = 1
     and (r -> 'commandes' -> 0 ->> 'premier_article') = 'Valise cabine'
     and (r -> 'commandes' -> 0 -> 'client' ->> 'nb_commandes')::int = 1 from l),
  'à confirmer : la plus ancienne d''abord, avec ses articles et la fiche du client');
select is((public.gestion_liste_commandes(tests.id('A'), 'a_confirmer', '20000002') -> 'commandes' -> 0 ->> 'numero'),
  (select ab from n), 'la recherche par téléphone trouve la commande');
select is(jsonb_array_length(public.gestion_liste_commandes(tests.id('A'), 'a_confirmer', 'Client AB') -> 'commandes'), 1,
  'la recherche par nom aussi');
select is(tests.indice(format('select public.gestion_liste_commandes(%L)', tests.id('B'))), 'role',
  'un membre de A ne liste pas les commandes de B');
select is(public.gestion_commande(tests.id('A'), (select b from n)), null,
  'le numéro d''une commande de B ne donne rien dans A');
select ok((
  with f as (select public.gestion_commande(tests.id('A'), (select a from n)) as r)
  select r ->> 'statut' = 'recue' and jsonb_array_length(r -> 'lignes') = 1
     and (r -> 'lignes' -> 0 ->> 'stock_restant')::int = 3
     and jsonb_array_length(r -> 'historique') = 1 and r -> 'client' ->> 'nom' = 'Client A' from f),
  'la fiche donne les lignes (et le stock restant), l''historique et la fiche client');

reset role; select tests.connecte('inconnu');
select is(tests.indice(format('select public.gestion_liste_commandes(%L)', tests.id('A'))), 'role',
  'un compte sans rôle ne lit rien');
reset role; select tests.anonyme();
select is(tests.indice(format('select public.gestion_commande(%L, %L)', tests.id('A'), (select a from n))), 'sans indice',
  'un visiteur n''appelle même pas la fonction (droit d''exécution)');
reset role; select tests.connecte('client_a');
select is(tests.indice(format('select public.gestion_commande(%L, %L)', tests.id('A'), (select a from n))), 'role',
  'un client ne lit pas la fiche de l''équipe, même de sa propre commande');


-- ---------------------------------------------------------------------
-- Plus d'UPDATE direct, pour personne
-- ---------------------------------------------------------------------
reset role; select tests.connecte('proprio_a');
update public.commandes set statut = 'livree', total_millimes = 1 where boutique_id = tests.id('A');
reset role;
select is((select count(*) from public.commandes where boutique_id = tests.id('A') and (statut = 'livree' or total_millimes = 1)),
  0::bigint, 'même le propriétaire ne modifie pas une commande en direct (statut, total)');


-- ---------------------------------------------------------------------
-- Appels de confirmation
-- ---------------------------------------------------------------------
select tests.connecte('prepa_a');
select is(tests.indice(format('select public.gestion_appel(%L, %L, ''appel'', ''confirmee'')', tests.id('A'), (select a from n))),
  'role', 'le préparateur ne confirme pas');
reset role; select tests.connecte('lecture_a');
select is(tests.indice(format('select public.gestion_appel(%L, %L, ''appel'', ''injoignable'')', tests.id('A'), (select a from n))),
  'role', 'lecture n''appelle pas');

reset role; select tests.connecte('confirm_a');
select is(public.gestion_appel(tests.id('A'), (select a from n), 'appel', 'injoignable', 'Messagerie'), 'recue',
  'un appel sans réponse est noté ; la commande attend toujours');
select is(public.gestion_appel(tests.id('A'), (select a from n), 'whatsapp', 'confirmee', 'Confirmé sur WhatsApp'), 'confirmee',
  'une confirmation (ici sur WhatsApp) confirme la commande');
select is(tests.indice(format('select public.gestion_appel(%L, %L, ''appel'', ''confirmee'')', tests.id('A'), (select a from n))),
  'change', 'une commande déjà confirmée ne se confirme pas deux fois');
select is(tests.indice(format('select public.gestion_appel(%L, %L, ''pigeon'', ''confirmee'')', tests.id('A'), (select ab from n))),
  'canal', 'un canal inconnu est refusé');
select is(tests.indice(format('select public.gestion_appel(%L, ''MAY-0000-99999'', ''appel'', ''confirmee'')', tests.id('A'))),
  'commande', 'un numéro inconnu est refusé');

reset role;
select results_eq(
  format($$ select canal::text, resultat::text, note, auteur_id from public.confirmations where commande_id = %L order by created_at $$, tests.id('commande_a')),
  format($$ values ('appel'::text, 'injoignable'::text, 'Messagerie'::text, %L::uuid), ('whatsapp', 'confirmee', 'Confirmé sur WhatsApp', %L) $$,
    tests.id('confirm_a'), tests.id('confirm_a')),
  'chaque tentative est notée : canal, résultat, note, auteur');
select ok((
  select c.confirmee_at is not null
     and (select e.auteur_id from public.commande_evenements e where e.commande_id = c.id and e.statut_apres = 'confirmee') = tests.id('confirm_a')
  from public.commandes c where c.id = tests.id('commande_a')),
  'la confirmation est horodatée et l''historique porte le nom du confirmateur');

select tests.connecte('confirm_a');
select is(public.gestion_appel(tests.id('A'), (select ab from n), 'appel', 'refus', 'Ne veut plus de la valise'), 'annulee',
  'un refus au téléphone annule la commande, avec son motif');
reset role;
select ok((
  select c.motif_annulation = 'Ne veut plus de la valise' and c.stock_reintegre
  from public.commandes c where c.id = tests.id('commande_ab_a')),
  'l''annulation rend le stock (une pièce) et garde le motif');


-- ---------------------------------------------------------------------
-- Étape attendue : deux employés, un seul geste
-- ---------------------------------------------------------------------
select tests.connecte('prepa_a');
select is(tests.indice(format('select public.gestion_expedier(%L, %L, ''recue'')', tests.id('A'), (select a from n))),
  'change', 'l''écran affichait « reçue », la commande est confirmée : le geste est refusé, pas rejoué à l''aveugle');
select lives_ok(format('select public.gestion_expedier(%L, %L, ''confirmee'', ''Aramex'', ''TN123456'')', tests.id('A'), (select a from n)),
  'le préparateur expédie, avec transporteur et numéro de suivi');
reset role;
select is((select row(statut, transporteur, numero_suivi)::text from public.commandes where id = tests.id('commande_a')),
  '(expediee,Aramex,TN123456)', 'la commande est expédiée, transporteur et suivi notés');

select tests.connecte('confirm_a');
select is(tests.indice(format('select public.gestion_annuler(%L, %L, ''expediee'', ''Trop tard'')', tests.id('A'), (select a from n))),
  'change', 'une commande partie ne s''annule plus');


-- ---------------------------------------------------------------------
-- À la livraison : livrée, ou refusée avec son origine
-- ---------------------------------------------------------------------
select is(tests.indice(format('select public.gestion_refuser(%L, %L, ''expediee'', null)', tests.id('A'), (select a from n))),
  'origine', 'un refus sans origine est refusé');
select lives_ok(format('select public.gestion_refuser(%L, %L, ''expediee'', ''client'', ''Absent deux fois'')', tests.id('A'), (select a from n)),
  'refus à la livraison, origine client');
reset role;
select ok((
  select c.statut = 'refusee' and c.refus_origine = 'client' and c.stock_reintegre and c.cloturee_at is not null
     and (select nb_refus from public.clients where id = tests.id('fiche_client_a')) = 1
     and (select stock from public.variantes where id = tests.id('variante_a')) = 5
  from public.commandes c where c.id = tests.id('commande_a')),
  'le refus clôt la commande, rend le stock (5 à nouveau) et compte contre le client');

-- Une commande livrée : paiement encaissé.
insert into public.commandes (id, boutique_id, client_id, statut, contact_nom, contact_telephone, livraison_ligne1, livraison_ville, livraison_gouvernorat)
values (tests.nouvel_id('commande_livree'), tests.id('A'), tests.id('fiche_client_a'), 'expediee', 'Client A', '+21620000001', '1 rue de Rome', 'Tunis', 'tunis');
select tests.connecte('prepa_a');
select lives_ok(format('select public.gestion_livrer(%L, %L, ''expediee'')', tests.id('A'),
  (select numero from public.commandes where id = tests.id('commande_livree'))), 'le préparateur note la livraison');
reset role;
select is((select row(statut, statut_paiement)::text from public.commandes where id = tests.id('commande_livree')), '(livree,paye)',
  'livrée en paiement à la livraison : le paiement est encaissé');


-- ---------------------------------------------------------------------
-- Annulation, note interne
-- ---------------------------------------------------------------------
insert into public.commandes (id, boutique_id, contact_nom, contact_telephone, livraison_ligne1, livraison_ville, livraison_gouvernorat)
values (tests.nouvel_id('commande_a_annuler'), tests.id('A'), 'X', '+21620000009', 'x', 'x', 'tunis');
create temp view n2 as select numero from public.commandes where id = tests.id('commande_a_annuler');
grant select on n2 to authenticated;
select tests.connecte('confirm_a');
select is(tests.indice(format('select public.gestion_annuler(%L, %L, ''recue'', '' '')', tests.id('A'), (select numero from n2))),
  'motif', 'une annulation sans motif est refusée');
select lives_ok(format('select public.gestion_annuler(%L, %L, ''recue'', ''Doublon de commande'')', tests.id('A'), (select numero from n2)),
  'le confirmateur annule, avec un motif');
reset role; select tests.connecte('lecture_a');
select is(tests.indice(format('select public.gestion_note(%L, %L, ''Client fidèle'')', tests.id('A'), (select numero from n2))),
  'role', 'lecture n''écrit pas de note interne');
reset role; select tests.connecte('prepa_a');
select lives_ok(format('select public.gestion_note(%L, %L, ''Rappeler après 18 h'')', tests.id('A'), (select numero from n2)),
  'toute l''équipe (sauf lecture) écrit la note interne');
reset role;
select is((select note_interne from public.commandes where id = tests.id('commande_a_annuler')), 'Rappeler après 18 h',
  'la note interne est enregistrée');


-- ---------------------------------------------------------------------
-- Les autres boutiques, les compteurs
-- ---------------------------------------------------------------------
select tests.connecte('proprio_b');
select is(tests.indice(format('select public.gestion_appel(%L, %L, ''appel'', ''confirmee'')', tests.id('A'), (select ab from n))),
  'role', 'le propriétaire de B n''agit pas sur les commandes de A');
reset role; select tests.connecte('multi');
select is(tests.indice(format('select public.gestion_appel(%L, %L, ''appel'', ''confirmee'')', tests.id('B'), (select b from n))),
  'role', 'admin dans A, lecture dans B : il ne confirme pas dans B');
select ok((
  with l as (select public.gestion_liste_commandes(tests.id('A'), 'cloturees') as r)
  select (r -> 'compteurs' ->> 'cloturees')::int = 4 and (r -> 'compteurs' ->> 'a_confirmer')::int = 0 from l),
  'les compteurs suivent : quatre clôturées (refus, livraison, deux annulations), plus rien à confirmer');

reset role;
select * from finish();
rollback;
