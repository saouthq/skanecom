-- =====================================================================
-- 30 · Livraison : le supplément selon le poids du colis
-- =====================================================================
begin;
\ir outils.psql

select plan(20);

-- Jeu d'essai (outils.psql) : A est en frais par zone (Grand Tunis, 6,000 TND
-- pour Tunis ; ailleurs le tarif fixe par défaut, 7,000 TND) ; variante_a
-- (189,000 TND, 5 en stock) pèse ici 3 kg.
update public.variantes set poids_grammes = 3000 where id = tests.id('variante_a');

create function tests.frais(p_gouvernorat text, p_sous_total bigint, p_poids integer) returns bigint language sql as $$
  select public.frais_livraison_millimes(tests.id('A'), p_gouvernorat, p_sous_total, p_poids)
$$;
create function tests.devis(p_quantite integer) returns jsonb language sql as $$
  select public.devis_commande(tests.id('A'), jsonb_build_array(jsonb_build_object('variante_id', tests.id('variante_a'), 'quantite', p_quantite)), 'tunis')
$$;
grant execute on all functions in schema tests to anon, authenticated;

select is(tests.frais('tunis', 100000, 50000), 6000::bigint, 'sans le réglage, le poids ne change rien');

-- ---------------------------------------------------------------------
-- Les tranches, au backoffice
-- ---------------------------------------------------------------------
reset role; select tests.anonyme();
select throws_ok(format($$ select public.gestion_enregistrer_tranche(%L, null, 5000, 0) $$, tests.id('A')), '42501', null,
  'un visiteur ne touche pas aux tranches');
reset role; select tests.connecte('lecture_a');
select throws_ok(format($$ select public.gestion_enregistrer_tranche(%L, null, 5000, 0) $$, tests.id('A')), '42501', null,
  'la lecture seule non plus');
reset role; select tests.connecte('proprio_a');
select lives_ok(format($$ select public.gestion_enregistrer_tranche(%L, null, 5000, 0) $$, tests.id('A')), 'jusqu''à 5 kg : rien');
select lives_ok(format($$ select public.gestion_enregistrer_tranche(%L, null, 10000, 3000) $$, tests.id('A')), 'jusqu''à 10 kg : 3,000 TND');
select lives_ok(format($$ select public.gestion_enregistrer_tranche(%L, null, null, 8000) $$, tests.id('A')), 'au-delà : 8,000 TND');
select throws_like(format($$ select public.gestion_enregistrer_tranche(%L, null, 5000, 1000) $$, tests.id('A')),
  '%déjà une tranche à ce poids%', 'deux tranches au même poids : non');
select throws_like(format($$ select public.gestion_enregistrer_tranche(%L, null, null, 1000) $$, tests.id('A')),
  '%déjà une tranche « au-delà »%', 'une seule tranche « au-delà »');
select is(jsonb_array_length(public.gestion_reglages(tests.id('A')) -> 'tranches'), 3, 'les réglages rendent les tranches');
select lives_ok(format($$ select public.gestion_enregistrer_reglages(%L, '{"livraison.supplement_poids": true}') $$, tests.id('A')),
  'le supplément se met en réglage');

-- ---------------------------------------------------------------------
-- Le calcul
-- ---------------------------------------------------------------------
reset role; select tests.anonyme();
select is(tests.frais('tunis', 100000, 4000), 6000::bigint, 'un colis de 4 kg : le tarif de la zone');
select is(tests.frais('tunis', 100000, 7000), 9000::bigint, '7 kg : la zone et 3,000 TND');
select is(tests.frais('tunis', 100000, 50000), 14000::bigint, '50 kg : la tranche « au-delà »');
select is(tests.frais('sfax', 100000, 7000), 10000::bigint, 'hors zone : le tarif fixe, et le supplément');
select results_eq($$ select (d ->> 'poids_grammes')::int, (d ->> 'supplement_poids_millimes')::bigint, (d ->> 'frais_livraison_millimes')::bigint
                      from tests.devis(3) d $$,
  $$ values (9000, 3000::bigint, 9000::bigint) $$, 'le devis pèse le panier (3 × 3 kg) et dit son supplément');
select isnt(public.boutique_publique('essai-a') -> 'tranches_poids', null, 'la vitrine connaît les tranches en vigueur');

reset role; select tests.connecte('proprio_a');
select public.gestion_supprimer_tranche(tests.id('A'), (select id from public.tranches_poids where boutique_id = tests.id('A') and jusqu_a_grammes is null));
reset role; select tests.anonyme();
select is(tests.frais('tunis', 100000, 50000), 9000::bigint, 'sans tranche « au-delà », la plus lourde s''applique');

reset role; select tests.connecte('proprio_a');
select public.gestion_enregistrer_reglages(tests.id('A'), '{"livraison.seuil_gratuite_millimes": 150000}');
reset role; select tests.anonyme();
select results_eq($$ select (d ->> 'frais_livraison_millimes')::bigint, (d ->> 'supplement_poids_millimes')::bigint from tests.devis(1) d $$,
  $$ values (0::bigint, 0::bigint) $$, 'livraison offerte dès le seuil : supplément compris');

reset role;
select is((select count(*) from plateforme.journal_audit where boutique_id = tests.id('A') and action like 'reglages.tranche_poids%'), 4::bigint,
  'chaque tranche ajoutée ou retirée passe au journal');
reset role; select tests.connecte('proprio_a');
select public.gestion_enregistrer_reglages(tests.id('A'), '{"livraison.supplement_poids": false}');
reset role; select tests.anonyme();
select is(public.boutique_publique('essai-a') -> 'tranches_poids', 'null'::jsonb, 'réglage coupé : la vitrine n''annonce plus de tranches');

select * from finish();
rollback;
