-- =====================================================================
-- 106 · Le paiement en ligne Konnect, sur le compte de la boutique
-- =====================================================================
begin;
\ir outils.psql

select plan(27);

delete from plateforme.konnect_comptes;
insert into plateforme.modules_actifs (boutique_id, module, actif) values (tests.id('A'), 'paiement_en_ligne', true)
on conflict (boutique_id, module) do update set actif = true;

-- Sans compte, le réglage ne s'allume pas.
select tests.connecte('proprio_a');
select throws_like(format($$ select public.gestion_enregistrer_reglages(%L, '{"paiement.konnect_actif": true}') $$, tests.id('A')),
  '%Branchez d''abord le compte Konnect%', 'sans compte branché, le paiement en ligne ne s''allume pas');
select is((public.gestion_konnect(tests.id('A')) ->> 'compte'), null, 'le backoffice le voit : aucun compte');
select tests.connecte('proprio_b');
select throws_ok(format($$ select public.gestion_konnect(%L) $$, tests.id('A')), '42501', null, 'une autre boutique ne lit pas son compte');

-- Brancher : l'application chiffre, la base range (et revérifie le rôle).
reset role; select tests.service();
select throws_ok(format($$ select public.konnect_brancher(%L, %L, 'wallet1234', 'chiffre-de-test-xxxxxxxxxxxx', 'abcd', 'essai') $$,
  tests.id('A'), tests.id('proprio_b')), '42501', null, 'seul un propriétaire ou un administrateur de la boutique branche');
select throws_ok(format($$ select public.konnect_brancher(%L, %L, 'x', 'chiffre-de-test-xxxxxxxxxxxx', 'abcd', 'essai') $$,
  tests.id('A'), tests.id('proprio_a')), '22023', null, 'un portefeuille illisible est refusé');
select is((public.konnect_brancher(tests.id('A'), tests.id('proprio_a'), '5f7a209aeb3f76490ac4a3d1', 'chiffre-de-test-xxxxxxxxxxxx', 'wXyZ', 'essai') ->> 'mode'),
  'essai', 'branché, en essai');
reset role;
select ok(not exists (select 1 from plateforme.konnect_comptes where cle_chiffree like '%sk_%'), 'la base ne garde qu''un chiffré');
select ok(exists (select 1 from plateforme.journal_audit where action = 'konnect.brancher' and boutique_id = tests.id('A')), 'tracé au journal');

-- Allumé, et seul moyen de paiement : la boutique accepte encore des commandes.
select tests.connecte('proprio_a');
select lives_ok(format($$ select public.gestion_enregistrer_reglages(%L, '{"paiement.konnect_actif": true}') $$, tests.id('A')),
  'avec son compte, le paiement en ligne s''allume');
select lives_ok(format($$ select public.gestion_enregistrer_reglages(%L, '{"paiement.cod_actif": false}') $$, tests.id('A')),
  'et le paiement à la livraison peut se couper : il reste un moyen de payer');
reset role;
select ok(private.konnect_pret(tests.id('A')), 'Konnect est prêt pour A');

-- Une commande, son paiement ouvert, puis noté.
reset role;
update public.commandes set jeton_suivi_hash = sha256(convert_to('jeton-essai', 'UTF8')), statut = 'recue',
       statut_paiement = 'en_attente', mode_paiement = 'cod', sous_total_millimes = 59000, total_millimes = 59000
 where id = tests.id('commande_a');
create temp table k as
select c.id, c.numero, c.total_millimes from public.commandes c where c.id = tests.id('commande_a');
grant select on k to service_role, anon, authenticated;
select tests.service();
select is((public.konnect_preparer(tests.id('A'), (select numero from k), 'mauvais') ), null, 'sans le bon jeton : rien');
select is((public.konnect_preparer(tests.id('A'), (select numero from k), 'jeton-essai') ->> 'wallet_id'), '5f7a209aeb3f76490ac4a3d1',
  'avec son jeton : ce qu''il faut pour ouvrir le paiement');
select public.konnect_ouvert((select id from k), 'pay_ref_essai_1', 'https://gateway.sandbox.konnect.network/pay?ref=1', (select total_millimes from k), 'essai');
reset role;
select is((select mode_paiement::text || ' ' || statut_paiement::text from public.commandes where id = (select id from k)), 'konnect en_attente',
  'ouvert : la commande attend son paiement en ligne');
select tests.service();
select is((public.konnect_noter('pay_ref_essai_1', 'paye', (select total_millimes from k) - 1, '{}') ->> 'statut'), 'en_attente',
  'un montant inférieur à celui ouvert n''est pas « payé »');
select is((public.konnect_noter('pay_ref_essai_1', 'paye', (select total_millimes from k), '{"status": "completed"}') ->> 'statut'), 'paye', 'payé');
reset role;
select is((select statut_paiement::text from public.commandes where id = (select id from k)), 'paye', 'la commande est payée');
select tests.service();
select is((public.konnect_noter('pay_ref_essai_1', 'echoue', null, '{}') ->> 'change'), 'false', 'jamais de retour en arrière sur un paiement reçu');

-- La vitrine : l'état, et « payer à la livraison » (seulement si la boutique le prend).
select tests.anonyme();
select is((public.vitrine_paiement(tests.id('A'), (select numero from k), 'jeton-essai') ->> 'statut_paiement'), 'paye', 'l''acheteur voit sa commande payée');
select throws_like(format($$ select public.vitrine_payer_a_la_livraison(%L, %L, 'jeton-essai') $$, tests.id('A'), (select numero from k)),
  '%ne prend que le paiement en ligne%', 'la boutique ne prend que le paiement en ligne : pas de bascule');

-- L'équipe, au téléphone : « je paierai à la livraison » (un paiement non abouti).
reset role;
create temp table k2 as
select c.id, c.numero from public.commandes c
 where c.boutique_id = tests.id('A') and c.statut in ('recue', 'confirmee') and c.id <> (select id from k) limit 1;
grant select on k2 to authenticated;
update public.commandes set mode_paiement = 'konnect', statut_paiement = 'echoue' where id = (select id from k2);
select tests.connecte('proprio_b');
select throws_ok(format($$ select public.gestion_payer_a_la_livraison(%L, %L) $$, tests.id('A'), (select numero from k2)),
  '42501', null, 'une autre boutique n''y touche pas');
select tests.connecte('proprio_a');
select lives_ok(format($$ select public.gestion_payer_a_la_livraison(%L, %L) $$, tests.id('A'), (select numero from k2)),
  'l''équipe passe un paiement non abouti à la livraison');
reset role;
select is((select mode_paiement::text || ' ' || statut_paiement::text from public.commandes where id = (select id from k2)), 'cod en_attente',
  'le client paiera au livreur');
select tests.connecte('proprio_a');
select throws_like(format($$ select public.gestion_payer_a_la_livraison(%L, %L) $$, tests.id('A'), (select numero from k)),
  '%n''attend pas de paiement en ligne%', 'une commande payée en ligne ne repasse pas à la livraison');

-- Retirer le compte : le paiement en ligne s'éteint, la livraison revient.
reset role;
select tests.connecte('proprio_a');
select ok(public.gestion_konnect_retirer(tests.id('A')), 'le compte se retire');
reset role;
select ok(not private.konnect_pret(tests.id('A'))
       and coalesce((private.reglage(tests.id('A'), 'paiement.cod_actif'))::boolean, false),
  'plus de paiement en ligne, le paiement à la livraison revient');
select ok(exists (select 1 from plateforme.journal_audit where boutique_id = tests.id('A') and action = 'reglages.modifier'
                  and apres ->> 'paiement.konnect_actif' = 'false' and apres ->> 'paiement.cod_actif' = 'true'),
  'le journal des réglages le dit, comme un changement fait à la main');

select * from finish();
rollback;
