-- =====================================================================
-- 135 · Le point du livreur : la liste dit si une commande est déjà
--       payée en ligne (le livreur n'encaisse rien pour elle)
-- =====================================================================
begin;
\ir outils.psql

select plan(2);

reset role; select tests.connecte('lecture_a');
select ok((select bool_and(not (c ->> 'payee_en_ligne')::boolean)
             from jsonb_array_elements(public.gestion_liste_commandes(tests.id('A'), 'toutes') -> 'commandes') c),
  'payées à la livraison : aucune n''est « payée en ligne »');

reset role;
update public.commandes set mode_paiement = 'konnect', statut_paiement = 'paye' where id = tests.id('commande_a');
select tests.connecte('lecture_a');
select is((select (c ->> 'payee_en_ligne')::boolean
             from jsonb_array_elements(public.gestion_liste_commandes(tests.id('A'), 'toutes') -> 'commandes') c
            where c ->> 'numero' = (select numero from public.commandes where id = tests.id('commande_a'))),
  true, 'payée par Konnect, montant reçu : « payée en ligne », le livreur n''encaisse rien');

select * from finish();
rollback;
