-- =====================================================================
-- 15 · Les réglages de la boutique au backoffice
-- =====================================================================
begin;
\ir outils.psql

select plan(30);

-- Jeu d'essai (outils.psql) : A en frais par zone (zone_a « Grand Tunis »,
-- 6 000 millimes, avec Tunis), préfixe MAY ; B a sa zone « Sfax ».

-- ---------------------------------------------------------------------
-- Portes
-- ---------------------------------------------------------------------
reset role; select tests.anonyme();
select throws_ok(format($$ select public.gestion_reglages(%L) $$, tests.id('A')), '42501', null, 'un visiteur ne lit pas les réglages');
reset role; select tests.connecte('proprio_b');
select throws_ok(format($$ select public.gestion_reglages(%L) $$, tests.id('A')), '42501', null, 'le propriétaire de B ne lit pas ceux de A');
select throws_ok(format($$ select public.gestion_enregistrer_reglages(%L, '{"compte.obligatoire": false}') $$, tests.id('A')),
  '42501', null, 'ni ne les change');

reset role; select tests.connecte('lecture_a');
select is(jsonb_array_length(public.gestion_reglages(tests.id('A')) -> 'gouvernorats'), 24, 'toute l''équipe lit : les 24 gouvernorats');
select is((select r -> 'valeur' from jsonb_array_elements(public.gestion_reglages(tests.id('A')) -> 'reglages') r where r ->> 'cle' = 'livraison.mode_frais'),
  '"zone"'::jsonb, 'avec les valeurs de la boutique');
select is((select (r ->> 'modifiable')::boolean from jsonb_array_elements(public.gestion_reglages(tests.id('A')) -> 'reglages') r where r ->> 'cle' = 'commande.prefixe_numero'),
  false, 'le préfixe des numéros reste à la plateforme');
select throws_ok(format($$ select public.gestion_enregistrer_reglages(%L, '{"compte.obligatoire": false}') $$, tests.id('A')),
  '42501', null, 'la lecture seule ne change rien');
reset role; select tests.connecte('prepa_a');
select throws_ok(format($$ select public.gestion_enregistrer_reglages(%L, '{"compte.obligatoire": false}') $$, tests.id('A')),
  '42501', null, 'la préparation non plus');

-- ---------------------------------------------------------------------
-- Changer (propriétaire, admin)
-- ---------------------------------------------------------------------
reset role; select tests.connecte('proprio_a');
select is(public.gestion_enregistrer_reglages(tests.id('A'),
  '{"compte.obligatoire": false, "commande.mode_confirmation": "automatique", "livraison.seuil_gratuite_millimes": 300000}'), 3,
  'le propriétaire ouvre aux invités, confirme automatiquement, offre la livraison dès 300 TND');
select results_eq(format($$ select cle, valeur from public.reglages where boutique_id = %L and cle like any ('{compte.%%,commande.mode%%,livraison.seuil%%}') order by cle $$, tests.id('A')),
  $$ values ('commande.mode_confirmation'::text, '"automatique"'::jsonb), ('compte.obligatoire', 'false'), ('livraison.seuil_gratuite_millimes', '300000') $$,
  'les trois valeurs sont écrites');
select is(public.gestion_enregistrer_reglages(tests.id('A'), '{"compte.obligatoire": false}'), 0, 'rien ne change : rien n''est écrit');
select is(public.gestion_enregistrer_reglages(tests.id('A'), '{"compte.obligatoire": true}'), 1, 'revenir au défaut…');
select is((select count(*)::int from public.reglages where boutique_id = tests.id('A') and cle = 'compte.obligatoire'), 0,
  '…efface la ligne : la boutique suit de nouveau la plateforme');
select is(public.frais_livraison_millimes(tests.id('A'), 'tunis', 350000), 0::bigint, 'le seuil de livraison offerte s''applique aussitôt');

reset role;
select is((select apres from plateforme.journal_audit where boutique_id = tests.id('A') and action = 'reglages.modifier' order by id limit 1),
  '{"compte.obligatoire": false, "commande.mode_confirmation": "automatique", "livraison.seuil_gratuite_millimes": 300000}'::jsonb,
  'chaque changement passe au journal, avec ce qu''il était et ce qu''il devient');
select is((select acteur from plateforme.journal_audit where boutique_id = tests.id('A') and action = 'reglages.modifier' order by id limit 1),
  tests.id('proprio_a'), 'et son auteur');
select tests.connecte('proprio_a');

select throws_like(format($$ select public.gestion_enregistrer_reglages(%L, '{"commande.prefixe_numero": "PIR"}') $$, tests.id('A')),
  '%non modifiable depuis la boutique%', 'le préfixe des numéros ne se change pas depuis la boutique');
select throws_like(format($$ select public.gestion_enregistrer_reglages(%L, '{"paiement.konnect_actif": true}') $$, tests.id('A')),
  '%module%', 'Konnect ne s''active pas sans le module de paiement en ligne');
select throws_like(format($$ select public.gestion_enregistrer_reglages(%L, '{"paiement.cod_actif": false}') $$, tests.id('A')),
  '%au moins un moyen de paiement%', 'le paiement à la livraison ne se coupe pas s''il est le seul');
select throws_like(format($$ select public.gestion_enregistrer_reglages(%L, '{"commande.mode_confirmation": "jamais"}') $$, tests.id('A')),
  '%Valeur invalide%', 'un choix hors liste est refusé');
select throws_like(format($$ select public.gestion_enregistrer_reglages(%L, '{"livraison.frais_fixes_millimes": -5}') $$, tests.id('A')),
  '%hors limites%', 'des frais négatifs aussi');
select throws_like(format($$ select public.gestion_enregistrer_reglages(%L, '{"contact.whatsapp": "+216 12 345 678"}') $$, tests.id('A')),
  '%chiffres seulement%', 'un numéro WhatsApp s''écrit en chiffres');
select is(public.gestion_enregistrer_reglages(tests.id('A'), '{"contact.whatsapp": "21612345678"}'), 1, 'comme ceci');

-- ---------------------------------------------------------------------
-- Les zones
-- ---------------------------------------------------------------------
create temporary table zone (nom text primary key, id uuid);
grant all on zone to authenticated;
insert into zone values ('sud', public.gestion_enregistrer_zone(tests.id('A'), null, ' Sud ', 12000, 3, 5, true));
select results_eq(format($$ select nom_fr, frais_millimes, delai_jours_min::int, delai_jours_max::int from public.zones_livraison where id = %L $$, (select id from zone)),
  $$ values ('Sud'::text, 12000::bigint, 3, 5) $$, 'une zone de plus');
select throws_like(format($$ select public.gestion_enregistrer_zone(%L, null, 'Nord', 8000, 4, 2) $$, tests.id('A')),
  '%Délai invalide%', 'un délai à l''envers est refusé');
select is(public.gestion_rattacher_gouvernorats(tests.id('A'), format('{"sfax": "%s", "gabes": "%s", "tunis": "%s"}', (select id from zone), (select id from zone), tests.id('zone_a'))::jsonb),
  2, 'Sfax et Gabès passent dans la zone Sud (Tunis y était déjà)');
select is(public.frais_livraison_millimes(tests.id('A'), 'sfax', 1000), 12000::bigint, 'Sfax paie désormais le tarif de sa zone');
select throws_like(format($$ select public.gestion_rattacher_gouvernorats(%L, '{"sfax": "%s"}') $$, tests.id('A'), tests.id('zone_b')),
  '%Zone introuvable%', 'la zone d''une autre boutique n''existe pas pour A');
select is(public.gestion_supprimer_zone(tests.id('A'), (select id from zone)), 2, 'supprimer la zone Sud (deux gouvernorats)');
select is(public.frais_livraison_millimes(tests.id('A'), 'sfax', 1000), 7000::bigint, 'Sfax retombe sur le tarif fixe, jamais sur zéro');

select * from finish();
rollback;
