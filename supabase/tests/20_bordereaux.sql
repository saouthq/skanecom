-- =====================================================================
-- 20 · Les bordereaux de livraison
-- =====================================================================
begin;
\ir outils.psql

select plan(7);

reset role; select tests.anonyme();
select throws_ok(format($$ select public.gestion_bordereaux(%L, null, 'a_preparer') $$, tests.id('A')), '42501', null,
  'un visiteur n''imprime pas de bordereau');
reset role; select tests.connecte('proprio_b');
select is(jsonb_array_length(public.gestion_bordereaux(tests.id('B'), array[(select numero from public.commandes where id = tests.id('commande_a'))]) -> 'commandes'),
  0, 'le numéro d''une commande de A ne sort rien depuis B');

reset role;
update public.commandes set statut = 'confirmee' where id = tests.id('commande_a');
select tests.connecte('prepa_a');
select is(jsonb_array_length(public.gestion_bordereaux(tests.id('A'), null, 'a_preparer') -> 'commandes'), 1,
  'la préparation imprime les bordereaux des commandes à préparer');
select is(public.gestion_bordereaux(tests.id('A'), null, 'a_preparer') -> 'commandes' -> 0 ->> 'gouvernorat', 'Tunis',
  'avec l''adresse complète');
select is(jsonb_array_length(public.gestion_bordereaux(tests.id('A'), null, 'a_preparer') -> 'commandes' -> 0 -> 'lignes'), 1,
  'et ce que contient le colis');
select is(public.gestion_bordereaux(tests.id('A'), null, 'a_preparer') -> 'expediteur' ->> 'nom', 'Essai A', 'l''expéditeur : la boutique');
select throws_ok(format($$ select public.gestion_bordereaux(%L) $$, tests.id('A')), '23514', null,
  'sans commande ni étape, rien à imprimer');

select * from finish();
rollback;
