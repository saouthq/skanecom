-- =====================================================================
-- 41 · « Aujourd'hui » au backoffice : ce qui attend l'équipe
-- =====================================================================
begin;
\ir outils.psql

select plan(18);

-- Jeu d'essai (outils.psql) : dans A, commande_a et commande_ab_a (reçues,
-- une valise cabine chacune, variante_a) ; dans B, commande_ab_b.
create function pg_temp.jour(p_chemin text[]) returns jsonb language sql as $$
  select public.gestion_aujourdhui(tests.id('A')) #> p_chemin
$$;

-- ---------------------------------------------------------------------
-- Portes
-- ---------------------------------------------------------------------
reset role; select tests.anonyme();
select throws_ok(format($$ select public.gestion_aujourdhui(%L) $$, tests.id('A')), '42501', null, 'un visiteur ne lit rien');
reset role; select tests.connecte('proprio_b');
select throws_ok(format($$ select public.gestion_aujourdhui(%L) $$, tests.id('A')), '42501', null, 'l''équipe d''une autre boutique non plus');

-- ---------------------------------------------------------------------
-- Les commandes
-- ---------------------------------------------------------------------
reset role; select tests.connecte('prepa_a');
select is(pg_temp.jour('{commandes,a_confirmer}'), '2'::jsonb, 'deux commandes reçues à confirmer (toute l''équipe le voit)');
select is(pg_temp.jour('{commandes,a_rappeler}'), '0'::jsonb, 'aucune à rappeler encore');
select ok(pg_temp.jour('{commandes,attente_depuis}') is not null, 'et depuis quand la plus ancienne attend');

reset role;
insert into public.confirmations (boutique_id, commande_id, canal, resultat) values (tests.id('A'), tests.id('commande_a'), 'appel', 'injoignable');
select tests.connecte('prepa_a');
select is(pg_temp.jour('{commandes,a_rappeler}'), '1'::jsonb, 'un appel sans réponse : une commande à rappeler');

reset role;
insert into public.confirmations (boutique_id, commande_id, canal, resultat) values (tests.id('A'), tests.id('commande_ab_a'), 'appel', 'confirmee');
update public.commandes set statut = 'confirmee' where id = tests.id('commande_ab_a');
select tests.connecte('prepa_a');
select results_eq($$ select (pg_temp.jour('{commandes}') ->> 'a_confirmer')::int, (pg_temp.jour('{commandes}') ->> 'a_preparer')::int $$,
  $$ values (1, 1) $$, 'confirmée : elle passe de « à confirmer » à « à préparer »');

reset role;
update public.commandes set statut = 'expediee', transporteur = 'Aramex' where id = tests.id('commande_ab_a');
update public.commandes set expediee_at = now() - interval '6 days' where id = tests.id('commande_ab_a');
select tests.connecte('prepa_a');
select results_eq($$ select (pg_temp.jour('{commandes}') ->> 'en_livraison')::int, (pg_temp.jour('{commandes}') ->> 'en_retard')::int $$,
  $$ values (1, 1) $$, 'expédiée depuis six jours : en livraison, et en retard');

-- ---------------------------------------------------------------------
-- La journée : les montants pour la direction seulement
-- ---------------------------------------------------------------------
select is(pg_temp.jour('{journee,recues}'), '2'::jsonb, 'les deux commandes du jour sont comptées');
select is(pg_temp.jour('{direction}'), 'false'::jsonb, 'la préparation n''est pas la direction…');
select is(pg_temp.jour('{journee,recues_millimes}'), 'null'::jsonb, '… elle ne voit pas les montants');
reset role; select tests.connecte('lecture_a');
select is(pg_temp.jour('{direction}'), 'true'::jsonb, 'la lecture (la direction) voit…');
select is((pg_temp.jour('{journee,recues_millimes}'))::bigint,
          (select sum(total_millimes) from public.commandes where boutique_id = tests.id('A'))::bigint,
  '… le montant reçu aujourd''hui');

-- ---------------------------------------------------------------------
-- Les modules, le stock
-- ---------------------------------------------------------------------
select is(pg_temp.jour('{modules}'), '{"sav": null, "avis": null, "devis": null, "comptes_pro": null}'::jsonb,
  'sans module : rien à signaler (null, pas zéro)');
reset role;
insert into plateforme.modules_actifs (boutique_id, module) values (tests.id('A'), 'avis'), (tests.id('A'), 'sav');
select tests.connecte('lecture_a');
select results_eq($$ select pg_temp.jour('{modules,avis}'), pg_temp.jour('{modules,sav}'), pg_temp.jour('{modules,devis}') $$,
  $$ values ('0'::jsonb, '0'::jsonb, 'null'::jsonb) $$, 'modules actifs : leur compte (zéro), les autres restent absents');

reset role;
select set_config('skanecom.ecriture_stock', 'on', true);
update public.variantes set stock = 0 where id = tests.id('variante_a');
select set_config('skanecom.ecriture_stock', '', true);
select tests.connecte('prepa_a');
select ok((pg_temp.jour('{stock,ruptures}'))::int >= 1, 'une pièce épuisée est comptée');
select is(pg_temp.jour('{stock,pieces,0,sku}'), '"VAL-55-NOIR"'::jsonb, 'et vient en tête des pièces à réassortir');
select is((select count(*)::int from jsonb_array_elements(pg_temp.jour('{stock,pieces}')) x
            where x ->> 'sku' not in (select v.sku from public.variantes v where v.boutique_id = tests.id('A'))),
  0, 'rien d''une autre boutique');

select * from finish();
rollback;
