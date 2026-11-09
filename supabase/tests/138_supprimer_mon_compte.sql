-- =====================================================================
-- 138 · Supprimer mon compte : refusé tant qu'une commande est en cours ;
--       la fiche et l'historique restent à la boutique ; l'identifiant
--       n'est effacé que si plus rien ne le rattache
-- =====================================================================
begin;
\ir outils.psql

select plan(9);

-- client_a : sa commande dans A est encore « reçue » (outils.psql).
reset role; select tests.connecte('client_a');
select is((select public.supprimer_mon_compte(tests.id('A')) ->> 'raison'), 'commande', 'une commande pas encore close : refusé, la raison dite');
reset role;
select ok((select user_id from public.clients where id = tests.id('fiche_client_a')) = tests.id('client_a'), '… et rien n''a changé');

-- La commande livrée : la suppression passe.
update public.commandes set statut = 'livree' where id = tests.id('commande_a');
insert into public.favoris (boutique_id, user_id, produit_id) select tests.id('A'), tests.id('client_a'), p.id from public.produits p where p.boutique_id = tests.id('A') limit 1;
select tests.connecte('client_a');
select is((select public.supprimer_mon_compte(tests.id('A'))), '{"ok": true, "compte_efface": true}'::jsonb, 'plus rien en cours : supprimé, l''identifiant aussi (client d''aucune autre boutique)');
reset role;
select is((select user_id from public.clients where id = tests.id('fiche_client_a')), null, 'la fiche reste à la boutique, sans compte');
select is((select count(*)::int from public.commandes where id = tests.id('commande_a')), 1, 'l''historique des commandes reste');
select is((select count(*)::int from public.adresses where client_id = tests.id('fiche_client_a')), 0, 'ses adresses enregistrées sont effacées');
select is((select count(*)::int from public.favoris where user_id = tests.id('client_a')), 0, 'ses favoris aussi');
select is((select count(*)::int from auth.users where id = tests.id('client_a')), 0, 'l''identifiant de connexion est effacé');

-- client_ab, client aussi de B : seule A l'oublie, son identifiant reste.
select tests.connecte('proprio_a'); reset role;
update public.commandes set statut = 'livree' where id = tests.id('commande_ab_a');
select tests.connecte('client_ab');
select is((select public.supprimer_mon_compte(tests.id('A')) ->> 'compte_efface'), 'false', 'client d''une autre boutique : seule celle-ci l''oublie, l''identifiant reste');

select * from finish();
rollback;
