-- =====================================================================
-- 92 · La console, lot 2 : ce que la relecture a corrigé
-- =====================================================================
begin;
\ir outils.psql

select plan(14);

select tests.cree_utilisateur('support_plateforme');
insert into plateforme.administrateurs (user_id, role) values (tests.id('support_plateforme'), 'support');
select tests.cree_utilisateur('nouveau_membre');

-- ---------------------------------------------------------------------
-- Le lien d'une annonce
-- ---------------------------------------------------------------------
reset role; select tests.service();
select lives_ok(format($$ select public.console_publier_annonce(%L, 'Lien', 'Un texte.', 'info', 'https://skanecom.tn/nouveau', null, null, null) $$,
  tests.id('admin_plateforme')), 'une annonce porte un lien https');
select lives_ok(format($$ select public.console_publier_annonce(%L, 'Chemin', 'Un texte.', 'info', '/gestion/essai-a/reglages', null, null, null) $$,
  tests.id('admin_plateforme')), 'ou un chemin du back-office');
select throws_ok(format($$ select public.console_publier_annonce(%L, 'Ailleurs', 'Un texte.', 'info', '//ailleurs.example/x', null, null, null) $$,
  tests.id('admin_plateforme')), '23514', null, '« //ailleurs » ne sort pas de la plateforme');
select throws_ok(format($$ select public.console_publier_annonce(%L, 'Ailleurs', 'Un texte.', 'info', '/\ailleurs.example', null, null, null) $$,
  tests.id('admin_plateforme')), '23514', null, 'ni « /\ailleurs »');

-- Une annonce programmée, arrêtée avant son début, ne paraît jamais.
select public.console_publier_annonce(tests.id('admin_plateforme'), 'Demain', 'Un texte.', 'info', null, now() + interval '1 day', null, null) as programmee \gset
select is((select a ->> 'etat' from jsonb_array_elements(public.console_annonces(tests.id('admin_plateforme'))) a where (a ->> 'id')::bigint = :programmee),
  'prevue', 'programmée pour demain : prévue');
select public.console_arreter_annonce(tests.id('admin_plateforme'), :programmee);
select is((select a ->> 'etat' from jsonb_array_elements(public.console_annonces(tests.id('admin_plateforme'))) a where (a ->> 'id')::bigint = :programmee),
  'finie', 'arrêtée avant son début : finie, pas « prévue »');
reset role; select tests.connecte('proprio_a');
select is((select count(*)::int from jsonb_array_elements(public.gestion_annonces(tests.id('A'))) a where (a ->> 'id')::bigint = :programmee), 0,
  'et le back-office ne la verra pas');

-- ---------------------------------------------------------------------
-- Le support aide sans engager
-- ---------------------------------------------------------------------
reset role; select tests.service();
select throws_ok(format($$ select public.console_ajouter_membre(%L, %L, %L, 'proprietaire') $$,
  tests.id('support_plateforme'), tests.id('A'), tests.id('support_plateforme')),
  '42501', null, 'le support ne se nomme pas propriétaire d''une boutique');
select throws_ok(format($$ select public.console_modifier_membre(%L, %L, %L, 'lecture', true) $$,
  tests.id('support_plateforme'), tests.id('A'), tests.id('proprio_a')),
  '42501', null, 'ni ne rétrograde son propriétaire');
select lives_ok(format($$ select public.console_ajouter_membre(%L, %L, %L, 'preparateur') $$,
  tests.id('support_plateforme'), tests.id('A'), tests.id('nouveau_membre')),
  'il invite un rôle de travail');
select throws_ok(format($$ select public.console_marquer_demonstration(%L, %L, true) $$, tests.id('support_plateforme'), tests.id('A')),
  '42501', null, 'il ne cache pas une cliente parmi les démonstrations');
select throws_ok(format($$ select public.console_delier_skanfact(%L, %L) $$, tests.id('support_plateforme'), tests.id('A')),
  '42501', null, 'ni ne la délie de son client SkanFact');

-- ---------------------------------------------------------------------
-- Cloner : sans l'identité commerciale ni les moyens de paiement
-- ---------------------------------------------------------------------
reset role;
insert into plateforme.boutiques (id, slug, nom, statut) values (tests.nouvel_id('D'), 'essai-d', 'Essai D', 'en_preparation');
insert into public.reglages (boutique_id, cle, valeur) values (tests.id('A'), 'paiement.cod_actif', 'false');
select tests.service();
select public.console_cloner_configuration(tests.id('admin_plateforme'), tests.id('A'), tests.id('D'));
reset role;
select is((select count(*)::int from public.reglages where boutique_id = tests.id('D')
            and (cle = 'commande.prefixe_numero' or cle like 'paiement.%')), 0,
  'ni le préfixe des numéros de commande, ni les moyens de paiement');
select is((select valeur from public.reglages where boutique_id = tests.id('D') and cle = 'livraison.mode_frais'), '"zone"'::jsonb,
  'la livraison, si');

select * from finish();
rollback;
