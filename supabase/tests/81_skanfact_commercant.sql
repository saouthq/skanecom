-- =====================================================================
-- 81 · La facturation du commerçant, dans son SkanFact (B0 à B4)
-- =====================================================================
begin;
\ir outils.psql

select plan(54);

-- Des commandes de A (deux lignes, une remise, des frais), payées à la livraison.
create function pg_temp.commande(p_nom text, p_statut public.statut_commande)
returns void language sql as $$
  insert into public.commandes (id, boutique_id, client_id, contact_nom, contact_telephone, contact_email, livraison_ligne1, livraison_ville,
                                livraison_gouvernorat, statut, mode_paiement, sous_total_millimes, frais_livraison_millimes, remise_millimes,
                                total_millimes)
  values (tests.nouvel_id(p_nom), tests.id('A'), tests.id('fiche_client_a'), 'Amel Ben Salah', '+21622000111', 'amel@exemple.tn', 'Rue de Marseille', 'Tunis',
          'tunis', p_statut, 'cod', 89700, 7000, 10000, 86700);
  insert into public.commande_lignes (id, boutique_id, commande_id, produit_nom, variante_libelle, sku, prix_unitaire_millimes, quantite, total_ligne_millimes)
  values (tests.nouvel_id(p_nom || '_l1'), tests.id('A'), tests.id(p_nom), 'Collier argent', '45 cm', 'COL925', 29900, 2, 59800),
         (tests.nouvel_id(p_nom || '_l2'), tests.id('A'), tests.id(p_nom), 'Bracelet', null, null, 29900, 1, 29900);
$$;
create function pg_temp.statut(p_nom text, p_statut public.statut_commande)
returns void language sql as $$
  update public.commandes set statut = p_statut,
         statut_paiement = case when p_statut = 'livree' then 'paye' else statut_paiement end,
         refus_origine = case when p_statut = 'refusee' then 'client'::public.origine_refus end
   where id = tests.id(p_nom);
$$;
create function pg_temp.envoi(p_nom text, p_genre text) returns public.skanfact_envois
language sql as $$ select * from public.skanfact_envois where commande_id = tests.id(p_nom) and genre = p_genre $$;
create function pg_temp.dans_la_file(p_nom text) returns int
language sql as $$
  select count(*)::int from jsonb_array_elements(public.skanfact_file(tests.id('A')) -> 'envois') x
   where x -> 'commande' ->> 'id' = tests.id(p_nom)::text
$$;
create temp table e (entreprise uuid, autre uuid);
insert into e values ('00000000-0000-4000-8888-00000000e001', '00000000-0000-4000-8888-00000000e002');
grant select on e to authenticated, service_role;
select pg_temp.commande('avant', 'livree');

-- ---------------------------------------------------------------------
-- B0 · Connecter : l'état tiré au départ, retrouvé au retour
-- ---------------------------------------------------------------------
reset role; select tests.connecte('proprio_a');
select throws_like(format($$ select public.gestion_skanfact_demarrer(%L, repeat('a', 43)) $$, tests.id('A')),
  '%pas allumé%', 'module coupé : pas de connexion');
reset role;
insert into plateforme.modules_actifs (boutique_id, module) values (tests.id('A'), 'skanfact');
select tests.connecte('prepa_a');
select throws_ok(format($$ select public.gestion_skanfact_demarrer(%L, repeat('a', 43)) $$, tests.id('A')),
  '42501', null, 'un préparateur ne connecte pas la boutique');
select is((public.gestion_skanfact_etat(tests.id('A')) ->> 'connecte')::boolean, false, 'il lit l''état : pas connectée');
reset role; select tests.connecte('proprio_b');
select throws_ok(format($$ select public.gestion_skanfact(%L) $$, tests.id('A')), '42501', null, 'une autre boutique ne lit rien');
select throws_ok($$ select * from plateforme.skanfact_connexions $$, '42501', null, 'ni les connexions');
select throws_ok($$ select * from plateforme.skanfact_etats $$, '42501', null, 'ni les états en cours');

reset role; select tests.connecte('proprio_a');
select lives_ok(format($$ select public.gestion_skanfact_demarrer(%L, repeat('a', 43)) $$, tests.id('A')), 'le propriétaire commence');
select throws_ok($$ select public.skanfact_retrouver_etat(repeat('a', 43), auth.uid()) $$, '42501', null, 'l''état ne se retrouve que par le serveur');
reset role; select tests.service();
select is(public.skanfact_retrouver_etat(repeat('b', 43), tests.id('proprio_a')), null, 'un état faux : rien');
select is(public.skanfact_retrouver_etat(repeat('a', 43), tests.id('prepa_a')), null, 'le bon état, un autre membre : rien');
select is(public.skanfact_retrouver_etat(repeat('a', 43), tests.id('proprio_a')), null, '… et l''état est consommé : il ne sert plus');
reset role; select tests.connecte('proprio_a');
select public.gestion_skanfact_demarrer(tests.id('A'), repeat('c', 43));
reset role;
update plateforme.skanfact_etats set cree_le = now() - interval '11 minutes';
select tests.service();
select is(public.skanfact_retrouver_etat(repeat('c', 43), tests.id('proprio_a')), null, 'plus de dix minutes : rien');
reset role; select tests.connecte('proprio_a');
select public.gestion_skanfact_demarrer(tests.id('A'), repeat('d', 43));
reset role; select tests.service();
select is(public.skanfact_retrouver_etat(repeat('d', 43), tests.id('proprio_a')) ->> 'boutique_id', tests.id('A')::text, 'le bon état, le même membre : sa boutique');

select public.skanfact_connecter(tests.id('A'), tests.id('proprio_a'), (select entreprise from e), 'Bijoux Amel SARL',
  '{ventes.boutique.facturer,ventes.pieces.voir}', repeat('x', 40), now() + interval '365 days');
reset role; select tests.connecte('proprio_a');
select is(public.gestion_skanfact(tests.id('A')) -> 'connexion' ->> 'nom', 'Bijoux Amel SARL', 'connectée : « Connecté à Bijoux Amel SARL »');
select ok(not (public.gestion_skanfact(tests.id('A')) -> 'connexion' ? 'cle_chiffree'), 'la clé chiffrée ne sort jamais vers l''équipe');
select is((public.gestion_skanfact_etat(tests.id('A')) ->> 'a_regler')::boolean, true, 'les taux de TVA restent à choisir');
select is((public.gestion_skanfact(tests.id('A')) -> 'compteurs' ->> 'avant')::int, 1, 'une commande livrée avant la connexion est comptée à part');

-- Les réglages
select throws_like(format($$ select public.gestion_skanfact_regler(%L, '20', '7', 'confirmation') $$, tests.id('A')),
  '%taux de TVA%', 'un taux de TVA inconnu est refusé');
reset role; select tests.connecte('lecture_a');
select is(public.gestion_skanfact(tests.id('A')) -> 'connexion' ->> 'moment', 'confirmation', 'la lecture regarde (facture à la confirmation par défaut)');
select throws_ok(format($$ select public.gestion_skanfact_regler(%L, '13', '13', 'confirmation') $$, tests.id('A')), '42501', null, 'mais ne règle rien');

-- ---------------------------------------------------------------------
-- B1 · La commande confirmée devient une facture ; la file
-- ---------------------------------------------------------------------
reset role;
select pg_temp.commande('une', 'recue');
select pg_temp.statut('une', 'confirmee');
select is((pg_temp.envoi('une', 'facture')).etat, 'a_envoyer', 'confirmée : sa facture entre dans la file');
select tests.service();
select is(public.skanfact_file(tests.id('A')), null, 'rien ne part avant le choix des taux de TVA');
reset role; select tests.connecte('proprio_a');
select public.gestion_skanfact_regler(tests.id('A'), '19', '7', 'confirmation');
reset role; select tests.service();
select is(pg_temp.dans_la_file('une'), 1, 'les taux choisis : la facture part');
select is(public.skanfact_file(tests.id('A')) -> 'connexion' ->> 'cle_chiffree', repeat('x', 40), 'avec la clé chiffrée, pour le serveur seul');
select ok(public.skanfact_file(tests.id('A')) -> 'envois' -> 0 -> 'lignes' @> '[{"designation": "Collier argent — 45 cm", "code": "COL925"}]',
  'la désignation dit la déclinaison, le code est celui de l''article');
reset role; select tests.connecte('proprio_a');
select throws_ok(format($$ select public.skanfact_file(%L) $$, tests.id('A')), '42501', null, 'la file ne se lit pas par l''équipe');
reset role; select tests.service();

-- Une panne : l'envoi revient, à l'identique
select is(public.skanfact_prendre((pg_temp.envoi('une', 'facture')).id, '{"reference": "premier"}') -> 'corps' ->> 'reference', 'premier', 'pris : son corps est figé');
select is(public.skanfact_prendre((pg_temp.envoi('une', 'facture')).id, '{"reference": "second"}'), null, 'pris une fois : un autre tour ne l''envoie pas en même temps');
select public.skanfact_noter((pg_temp.envoi('une', 'facture')).id, 'plus_tard', null, 'SkanFact ne répond pas');
select ok((select etat = 'a_envoyer' and essais = 1 and prochain_essai between now() + interval '50 seconds' and now() + interval '70 seconds'
             from pg_temp.envoi('une', 'facture')), 'une panne : à renvoyer dans une minute');
select is(pg_temp.dans_la_file('une'), 0, 'pas avant');
reset role; update public.skanfact_envois set prochain_essai = now() where commande_id = tests.id('une');
select tests.service();
select is(public.skanfact_prendre((pg_temp.envoi('une', 'facture')).id, '{"reference": "autre"}') -> 'corps' ->> 'reference', 'premier', 'renvoyée : le même corps, à l''identique');
select public.skanfact_noter((pg_temp.envoi('une', 'facture')).id, 'fait', '{"facture": {"numero": "FAC-2026-012"}}', null);
select is((pg_temp.envoi('une', 'facture')).etat || ' ' || (pg_temp.envoi('une', 'facture')).essais, 'fait 2', 'faite au second essai');
select public.skanfact_noter((pg_temp.envoi('une', 'facture')).id, 'plus_tard', null, 'tard');
select is((pg_temp.envoi('une', 'facture')).etat, 'fait', 'une facture faite ne redevient jamais à envoyer');

-- B3 · Livrée, payée à la livraison : le paiement à part ; jamais deux fois
reset role;
select pg_temp.statut('une', 'expediee');
select pg_temp.statut('une', 'livree');
select is((pg_temp.envoi('une', 'paiement')).cle, 'livraison', 'livrée : le paiement à la livraison entre dans la file');
update public.commandes set statut = 'expediee' where id = tests.id('une');
update public.commandes set statut = 'livree' where id = tests.id('une');
select is((select count(*)::int from public.skanfact_envois where commande_id = tests.id('une')), 2, 'livrée deux fois : un seul paiement');

-- Un refus de SkanFact (403) : sa phrase, et « Réessayer »
select pg_temp.commande('deux', 'recue');
select pg_temp.statut('deux', 'confirmee');
select tests.service();
select public.skanfact_prendre((pg_temp.envoi('deux', 'facture')).id, '{"timbre": true}');
select public.skanfact_noter((pg_temp.envoi('deux', 'facture')).id, 'refuse', null, 'La facture ferait 87,700 et la commande 86,700');
reset role; select tests.connecte('prepa_a');
select is((public.gestion_skanfact_etat(tests.id('A')) ->> 'refuses')::int, 1, 'le refus se voit dans la navigation');
select is(public.gestion_skanfact_commande(tests.id('A'), (select numero from public.commandes where id = tests.id('deux'))) -> 'envois' -> 0 ->> 'erreur',
  'La facture ferait 87,700 et la commande 86,700', 'la fiche de la commande dit la phrase de SkanFact');
select public.gestion_skanfact_reessayer(tests.id('A'), (pg_temp.envoi('deux', 'facture')).id);
select ok((select etat = 'a_envoyer' and corps is null from pg_temp.envoi('deux', 'facture')), 'réessayée : le corps se refait (après correction)');
select throws_like(format($$ select public.gestion_skanfact_reessayer(%L, %L) $$, tests.id('A'), (pg_temp.envoi('une', 'facture')).id),
  '%attend pas%', 'un envoi fait ne se réessaie pas');

-- ---------------------------------------------------------------------
-- B4 · Les retours : annulée, refusée, remboursée au SAV
-- ---------------------------------------------------------------------
reset role; select tests.service();
select public.skanfact_prendre((pg_temp.envoi('deux', 'facture')).id, '{"timbre": true}');
select public.skanfact_noter((pg_temp.envoi('deux', 'facture')).id, 'refuse', null, 'La facture ferait 87,700 et la commande 86,700');
reset role;
select pg_temp.statut('deux', 'annulee');
select ok((pg_temp.envoi('deux', 'facture')).etat = 'annule' and (pg_temp.envoi('deux', 'retour')).id is null,
  'annulée alors que SkanFact avait refusé sa facture (rien d''émis) : rien à défaire');

select pg_temp.commande('trois', 'recue');
select pg_temp.statut('trois', 'confirmee');
update public.skanfact_envois set etat = 'fait', essais = 1, corps = '{"timbre": false}' where commande_id = tests.id('trois');
select pg_temp.statut('trois', 'expediee');
select pg_temp.statut('trois', 'refusee');
select is((pg_temp.envoi('trois', 'retour')).cle || ' · ' || (pg_temp.envoi('trois', 'retour')).motif, 'refus · Commande refusée à la livraison',
  'refusée après sa facture : un retour de toute la commande, au motif fixe');

insert into public.sav_demandes (id, boutique_id, rang, numero, client_id, commande_id, ligne_id, produit_nom, description, statut, issue, cloturee_at)
values (tests.nouvel_id('sav'), tests.id('A'), 1, 'SAV-0001', tests.id('fiche_client_a'), tests.id('une'), tests.id('une_l2'), 'Bracelet',
        'Le fermoir a cédé au bout de deux jours', 'nouvelle', null, null);
update public.sav_demandes set statut = 'resolue', issue = 'remboursement', cloturee_at = now() where id = tests.id('sav');
select is((pg_temp.envoi('une', 'retour')).cle, 'sav-SAV-0001', 'remboursé au SAV : le retour de l''article');
select tests.service();
select ok(exists (select 1 from jsonb_array_elements(public.skanfact_file(tests.id('A')) -> 'envois') x
                   where x ->> 'genre' = 'retour' and x ->> 'sav_ligne' = tests.id('une_l2')::text
                     and x -> 'facture' ->> 'etat' = 'fait'),
  'la file dit l''article rendu, et la facture qu''il corrige');

-- ---------------------------------------------------------------------
-- 401 : coupée ; reconnectée ; une autre entreprise ; déconnectée
-- ---------------------------------------------------------------------
select public.skanfact_couper(tests.id('A'));
select is(public.skanfact_file(tests.id('A')), null, 'coupée (401) : rien ne part');
reset role; select tests.connecte('proprio_a');
select is((public.gestion_skanfact_etat(tests.id('A')) ->> 'coupee')::boolean, true, 'la boutique se dit coupée');
reset role;
select pg_temp.commande('quatre', 'recue');
select pg_temp.statut('quatre', 'confirmee');
select is((pg_temp.envoi('quatre', 'facture')).etat, 'a_envoyer', 'coupée, la file se remplit quand même');
update public.skanfact_envois set prochain_essai = now() + interval '2 hours' where commande_id = tests.id('quatre');
select tests.service();
select public.skanfact_connecter(tests.id('A'), tests.id('proprio_a'), (select entreprise from e), 'Bijoux Amel SARL',
  '{ventes.boutique.facturer,ventes.pieces.voir}', repeat('y', 40), now() + interval '365 days');
select is(pg_temp.dans_la_file('quatre'), 1, 'reconnectée : ce qui attendait part tout de suite');
reset role; select tests.connecte('proprio_a');
select is(public.gestion_skanfact(tests.id('A')) -> 'connexion' ->> 'tva_produits', '19', 'la même entreprise : les réglages restent');

reset role; select tests.connecte('prepa_a');
select is((select count(*)::int from public.skanfact_envois), 7, 'l''équipe lit les envois de sa boutique');
reset role; select tests.connecte('proprio_b');
select is((select count(*)::int from public.skanfact_envois), 0, 'une autre boutique ne les voit pas');

reset role; select tests.service();
select public.skanfact_connecter(tests.id('A'), tests.id('proprio_a'), (select autre from e), 'Autre SARL', '{}', repeat('z', 40), now() + interval '365 days');
select ok((pg_temp.envoi('quatre', 'facture')).etat = 'annule' and (pg_temp.envoi('une', 'facture')).etat = 'fait',
  'une autre entreprise : ce qui attendait l''ancienne est annulé, ce qui est fait reste');
reset role; select tests.connecte('proprio_a');
select is(public.gestion_skanfact(tests.id('A')) -> 'connexion' ->> 'tva_produits', null, '… et ses taux sont à choisir de nouveau');

-- Facturer à la main une commande d'avant
reset role; select tests.connecte('prepa_a');
select public.gestion_skanfact_facturer(tests.id('A'), (select numero from public.commandes where id = tests.id('avant')));
select is((pg_temp.envoi('avant', 'facture')).entreprise, (select autre from e), 'une commande d''avant se facture à la main');

reset role; select tests.connecte('proprio_a');
select public.gestion_skanfact_deconnecter(tests.id('A'));
select ok(public.gestion_skanfact(tests.id('A')) -> 'connexion' = 'null'::jsonb and jsonb_array_length(public.gestion_skanfact(tests.id('A')) -> 'faits') = 2,
  'déconnectée : la clé est oubliée, ce qui est fait reste');

select * from finish();
rollback;
