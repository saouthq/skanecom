-- =====================================================================
-- 107 · La facture au nom d'une société
-- =====================================================================
begin;
\ir outils.psql

select plan(17);

-- Ce que l'acheteur tape, rangé ou refusé.
select is((public.facturation_lisible('{"raison_sociale": "  Atelier   Hédi SARL ", "matricule_fiscal": "1234567a/m/000"}') ->> 'raison_sociale'),
  'Atelier Hédi SARL', 'la raison sociale, sans espaces de trop');
select is((public.facturation_lisible('{"raison_sociale": "Atelier Hédi", "matricule_fiscal": "1234567a/m/000"}') ->> 'matricule_fiscal'),
  '1234567A/M/000', 'le matricule fiscal, en capitales, séparateurs gardés');
select throws_like($$ select public.facturation_lisible('{"raison_sociale": "Atelier", "matricule_fiscal": "12AB"}') $$,
  '%matricule fiscal%', 'un matricule illisible est refusé');
select throws_like($$ select public.facturation_lisible('{"raison_sociale": "A", "matricule_fiscal": "1234567A/M/000"}') $$,
  '%raison sociale%', 'une raison sociale vide est refusée');
select throws_like($$ select public.facturation_lisible('{"raison_sociale": "Atelier", "matricule_fiscal": "1234567A", "adresse": {"ligne1": "", "ville": "Sfax"}}') $$,
  '%adresse de facturation%', 'une adresse de facturation à moitié remplie est refusée');
select is((public.facturation_lisible('{"raison_sociale": "Atelier", "matricule_fiscal": "1234567A", "adresse": {"ligne1": "", "ville": ""}}') -> 'adresse'),
  'null'::jsonb, 'une adresse laissée vide : celle de la livraison');

-- Une commande de A et son jeton.
reset role;
create temp table f as
select c.id, c.numero from public.commandes c where c.boutique_id = tests.id('A') and c.statut = 'recue' limit 1;
grant select on f to anon, authenticated, service_role;
update public.commandes set jeton_suivi_hash = sha256(convert_to('jeton-facture', 'UTF8')), facturation = null where id = (select id from f);
delete from public.reglages where boutique_id = tests.id('A') and cle = 'commande.facture_societe';

-- La vitrine : seulement si la boutique le propose, une fois, avec le jeton.
select tests.anonyme();
select throws_like(format($$ select public.vitrine_demander_facture(%L, %L, 'jeton-facture', '{"raison_sociale": "Atelier Hédi", "matricule_fiscal": "1234567A/M/000"}') $$,
  tests.id('A'), (select numero from f)), '%ne fait pas de facture%', 'réglage coupé (par défaut) : la vitrine ne la demande pas');
reset role;
insert into public.reglages (boutique_id, cle, valeur) values (tests.id('A'), 'commande.facture_societe', 'true');
select tests.anonyme();
select is(public.vitrine_demander_facture(tests.id('A'), (select numero from f), 'mauvais', '{"raison_sociale": "Atelier Hédi", "matricule_fiscal": "1234567A/M/000"}'),
  false, 'sans le bon jeton : rien');
select is(public.vitrine_demander_facture(tests.id('A'), (select numero from f), 'jeton-facture', '{"raison_sociale": "Atelier Hédi", "matricule_fiscal": "1234567A/M/000"}'),
  true, 'avec son jeton : la facture est demandée');
select is(public.vitrine_demander_facture(tests.id('A'), (select numero from f), 'jeton-facture', '{"raison_sociale": "Autre SARL", "matricule_fiscal": "7654321B/M/000"}'),
  false, 'une seule fois : la vitrine ne la change plus');
select is((public.vitrine_facturation(tests.id('A'), (select numero from f), 'jeton-facture') ->> 'raison_sociale'), 'Atelier Hédi',
  'la page de fin la relit');

-- Le backoffice : l'équipe de la boutique seulement.
select tests.connecte('proprio_b');
select throws_ok(format($$ select public.gestion_facturation(%L, %L) $$, tests.id('A'), (select numero from f)), '42501', null,
  'une autre boutique ne la lit pas');
select tests.connecte('proprio_a');
select is((public.gestion_facturation(tests.id('A'), (select numero from f)) #>> '{facturation,matricule_fiscal}'), '1234567A/M/000',
  'l''équipe la lit');
select is((public.gestion_regler_facturation(tests.id('A'), (select numero from f),
  '{"raison_sociale": "Atelier Hédi SARL", "matricule_fiscal": "1234567A/M/000", "adresse": {"ligne1": "Route de Gabès km 4", "ville": "Sfax", "code_postal": "3000"}}') #>> '{adresse,ville}'),
  'Sfax', 'l''équipe la corrige, avec une adresse de facturation');
reset role;
select ok(exists (select 1 from plateforme.journal_audit where action = 'commande.facturation' and boutique_id = tests.id('A')
                  and cible = (select numero from f)), 'tracé au journal');
select tests.connecte('proprio_a');
select is(public.gestion_regler_facturation(tests.id('A'), (select numero from f), null), null, 'et la retire');

-- Émise dans SkanFact : elle se corrige là-bas.
reset role;
insert into public.skanfact_envois (boutique_id, commande_id, genre, cle, entreprise, etat)
select tests.id('A'), (select id from f), 'facture', 'essai-facture-' || (select numero from f), gen_random_uuid(), 'fait';
select tests.connecte('proprio_a');
select throws_like(format($$ select public.gestion_regler_facturation(%L, %L, '{"raison_sociale": "Atelier", "matricule_fiscal": "1234567A"}') $$,
  tests.id('A'), (select numero from f)), '%déjà émise dans SkanFact%', 'une facture déjà émise ne se corrige plus d''ici');

select * from finish();
rollback;
