-- =====================================================================
-- 100 · Les e-mails de commande : coupés par défaut ; au client à chaque
--       étape (son adresse vérifiée), à l'équipe à chaque commande de la
--       vitrine ; jamais pour une vente au comptoir ; la file se vide et
--       retente un envoi manqué.
-- =====================================================================
begin;
\ir outils.psql

select plan(16);

-- Coupés par défaut : une étape ne met rien dans la file.
update public.commandes set statut = 'confirmee' where id = tests.id('commande_a');
select is((select count(*)::int from public.courriels_commandes where commande_id = tests.id('commande_a')), 0, 'par défaut, aucun e-mail de commande');

-- La boutique A les allume (les deux).
insert into public.reglages (boutique_id, cle, valeur) values
  (tests.id('A'), 'commande.courriels_client', 'true'), (tests.id('A'), 'commande.courriel_equipe', 'true');

update public.commandes set statut = 'expediee', transporteur = 'Aramex', numero_suivi = 'AR123' where id = tests.id('commande_a');
select is((select evenement from public.courriels_commandes where commande_id = tests.id('commande_a')), 'expediee', 'expédiée : un e-mail au client part dans la file');
update public.commandes set statut = 'expediee' where id = tests.id('commande_a');
select is((select count(*)::int from public.courriels_commandes where commande_id = tests.id('commande_a')), 1, 'le même statut redit : rien de plus');

-- Une commande de la vitrine : au client (reçue) et à l'équipe.
insert into public.commandes (id, boutique_id, client_id, contact_nom, contact_telephone, livraison_ligne1, livraison_ville, livraison_gouvernorat, origine)
values (tests.nouvel_id('commande_vitrine'), tests.id('A'), tests.id('fiche_client_a'), 'Client A', '+21620000001', '1 rue de Rome', 'Tunis', 'tunis', 'vitrine');
insert into public.commande_lignes (boutique_id, commande_id, variante_id, produit_nom, variante_libelle, prix_unitaire_millimes, quantite, total_ligne_millimes)
values (tests.id('A'), tests.id('commande_vitrine'), tests.id('variante_a'), 'Valise cabine', 'Noir', 189000, 2, 378000);
select is((select array_agg(evenement order by evenement) from public.courriels_commandes where commande_id = tests.id('commande_vitrine')),
  array['equipe', 'recue'], 'commande de la vitrine : « reçue » au client, et l''équipe prévenue');

-- Une vente au comptoir : rien.
insert into public.commandes (id, boutique_id, contact_nom, contact_telephone, origine, canal, sur_place, mode_livraison, statut)
values (tests.nouvel_id('commande_comptoir'), tests.id('A'), 'Passant', '+21620000009', 'manuelle', 'magasin', true, 'retrait', 'livree');
select is((select count(*)::int from public.courriels_commandes where commande_id = tests.id('commande_comptoir')), 0, 'vente au comptoir : aucun e-mail');

-- Une boutique qui ne les a pas allumés : rien.
update public.commandes set statut = 'confirmee' where id = tests.id('commande_ab_b');
select is((select count(*)::int from public.courriels_commandes where boutique_id = tests.id('B')), 0, 'la boutique B, réglage coupé : rien');

-- Personne d'autre que la clé de service ne lit la file.
select tests.connecte('proprio_a');
select is((select count(*)::int from public.courriels_commandes), 0, 'l''équipe de la boutique ne lit pas la file');
select throws_ok($$ select public.courriels_commandes_file(null, 10) $$, '42501', null, 'ni ne la vide');
reset role;

-- Vider la file
select tests.service();
create temp table f as select public.courriels_commandes_file(tests.id('A'), 10) as j;
grant select on f to service_role;
select is((select jsonb_array_length(j) from f), 3, 'la file rend les trois e-mails dus de A');
select is((select e -> 'a' ->> 0 from f, jsonb_array_elements(j) e where e ->> 'evenement' = 'recue'),
  'client_a@tests.skanecom.local', 'au client : l''adresse de son compte');
select ok((select (e -> 'a') ? 'proprio_a@tests.skanecom.local' and not ((e -> 'a') ? 'prepa_a@tests.skanecom.local')
             from f, jsonb_array_elements(j) e where e ->> 'evenement' = 'equipe'),
  'à l''équipe : le propriétaire et les administrateurs, pas la préparation');
select is((select e -> 'lignes' -> 0 ->> 'detail' from f, jsonb_array_elements(j) e where e ->> 'evenement' = 'recue'), 'Noir', 'avec ses lignes');
select is((select e -> 'commande' ->> 'numero_suivi' from f, jsonb_array_elements(j) e where e ->> 'evenement' = 'expediee'), 'AR123', 'et le suivi du colis');
select is(jsonb_array_length(public.courriels_commandes_file(tests.id('A'), 10)), 0, 'réservés : un second passage ne les reprend pas');

-- Envoyé / manqué
select public.courriels_commandes_noter((select (e ->> 'id')::bigint from f, jsonb_array_elements(j) e where e ->> 'evenement' = 'recue'), true);
select public.courriels_commandes_noter((select (e ->> 'id')::bigint from f, jsonb_array_elements(j) e where e ->> 'evenement' = 'equipe'), false, 'fournisseur indisponible');
reset role;
select is((select etat from public.courriels_commandes where commande_id = tests.id('commande_vitrine') and evenement = 'recue'), 'fait', 'envoyé : fait');
select is((select etat || ' ' || erreur from public.courriels_commandes where commande_id = tests.id('commande_vitrine') and evenement = 'equipe'),
  'a_envoyer fournisseur indisponible', 'manqué : retenté plus tard, l''erreur gardée');

select * from finish();
rollback;
