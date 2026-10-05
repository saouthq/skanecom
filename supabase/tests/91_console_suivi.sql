-- =====================================================================
-- 91 · La console qui suit ses clients : santé, tableau de bord, notes,
--      annonces, cycle de vie d'une boutique, équipe SkanEcom, journaux
-- =====================================================================
begin;
\ir outils.psql

select plan(36);

-- Un second membre de l'équipe SkanEcom, au rôle support.
select tests.cree_utilisateur('support_plateforme');
insert into plateforme.administrateurs (user_id, role) values (tests.id('support_plateforme'), 'support');

-- ---------------------------------------------------------------------
-- Les portes
-- ---------------------------------------------------------------------
reset role; select tests.connecte('proprio_a');
select throws_ok(format($$ select public.console_sante(%L) $$, tests.id('proprio_a')),
  '42501', null, 'un commerçant ne lit pas la santé des boutiques');
select throws_ok(format($$ select public.console_notes(%L, %L) $$, tests.id('proprio_a'), tests.id('A')),
  '42501', null, 'ni les notes que SkanEcom garde sur lui');

reset role; select tests.service();
select throws_ok(format($$ select public.console_tableau(%L, 30) $$, tests.id('proprio_a')),
  '42501', null, 'par le serveur non plus, sans être de l''équipe SkanEcom');

-- ---------------------------------------------------------------------
-- La santé, le tableau de bord
-- ---------------------------------------------------------------------
reset role;
update plateforme.domaines set statut_certificat = 'erreur' where hote = 'essai-a.test';
select tests.service();
select is((select e -> 'certificats_erreur' from jsonb_array_elements(public.console_sante(tests.id('admin_plateforme'))) e
            where (e ->> 'id')::uuid = tests.id('A')), '["essai-a.test"]'::jsonb,
  'la santé dit le certificat en erreur');
select is((select (e ->> 'publies')::int from jsonb_array_elements(public.console_sante(tests.id('support_plateforme'))) e
            where (e ->> 'id')::uuid = tests.id('A')), 1, 'et les pièces publiées (le support la lit aussi)');
select is(jsonb_array_length(public.console_tableau(tests.id('admin_plateforme'), 7) -> 'serie'), 7,
  'le tableau sur 7 jours a 7 jours');
select is((public.console_tableau(tests.id('admin_plateforme'), 12) ->> 'jours')::int, 30,
  'une période hors liste devient 30 jours');

-- ---------------------------------------------------------------------
-- Les notes de suivi
-- ---------------------------------------------------------------------
select throws_ok(format($$ select public.console_ajouter_note(%L, %L, '   ') $$, tests.id('admin_plateforme'), tests.id('A')),
  '23514', null, 'une note vide ne se garde pas');
select lives_ok(format($$ select public.console_ajouter_note(%L, %L, 'Appelé : veut le retrait en magasin.') $$, tests.id('admin_plateforme'), tests.id('A')),
  'une note se garde');
select is(jsonb_array_length(public.console_notes(tests.id('support_plateforme'), tests.id('A'))), 1, 'le support la lit');
select public.console_changer_note(tests.id('support_plateforme'),
  (select id from plateforme.notes_boutique where boutique_id = tests.id('A')), 'epingler');
select is((public.console_notes(tests.id('admin_plateforme'), tests.id('A')) -> 0 ->> 'epinglee')::boolean, true,
  'le support l''épingle');
select throws_ok(format($$ select public.console_changer_note(%L, %s, 'supprimer') $$, tests.id('support_plateforme'),
    (select id from plateforme.notes_boutique where boutique_id = tests.id('A'))),
  '42501', null, 'mais ne retire pas la note d''un autre');
select public.console_changer_note(tests.id('admin_plateforme'),
  (select id from plateforme.notes_boutique where boutique_id = tests.id('A')), 'supprimer');
select is(jsonb_array_length(public.console_notes(tests.id('admin_plateforme'), tests.id('A'))), 0, 'son auteur la retire');

-- ---------------------------------------------------------------------
-- Les annonces aux commerçants
-- ---------------------------------------------------------------------
select public.console_publier_annonce(tests.id('admin_plateforme'), 'Pour tous', 'Une nouveauté.', 'nouveaute', null, null, null, null) as annonce_tous \gset
select public.console_publier_annonce(tests.id('admin_plateforme'), 'Pour B', 'Seulement B.', 'info', null, now() - interval '1 hour', null, array[tests.id('B')]) as annonce_b \gset
reset role; select tests.connecte('proprio_a');
select is((select jsonb_agg(a ->> 'titre') from jsonb_array_elements(public.gestion_annonces(tests.id('A'))) a), '["Pour tous"]'::jsonb,
  'A voit l''annonce pour tous, pas celle de B');
select throws_ok(format($$ select public.gestion_fermer_annonce(%L, %s) $$, tests.id('A'), :annonce_b),
  'P0002', null, 'A ne ferme pas une annonce qui ne la vise pas');
select public.gestion_fermer_annonce(tests.id('A'), :annonce_tous);
select is(jsonb_array_length(public.gestion_annonces(tests.id('A'))), 0, 'fermée, elle ne revient pas');
reset role; select tests.connecte('proprio_b');
select is(jsonb_array_length(public.gestion_annonces(tests.id('B'))), 2, 'B, qui ne l''a pas fermée, voit les deux');
reset role; select tests.service();
select public.console_arreter_annonce(tests.id('admin_plateforme'), :annonce_b);
reset role; select tests.connecte('proprio_b');
select is((select jsonb_agg(a ->> 'titre') from jsonb_array_elements(public.gestion_annonces(tests.id('B'))) a), '["Pour tous"]'::jsonb,
  'arrêtée, elle quitte le back-office');

-- ---------------------------------------------------------------------
-- Le cycle de vie : renommer, les domaines, cloner
-- ---------------------------------------------------------------------
reset role; select tests.service();
select throws_ok(format($$ select public.console_renommer_boutique(%L, %L, 'x') $$, tests.id('admin_plateforme'), tests.id('A')),
  '23514', null, 'un nom d''une lettre est refusé');
select is(public.console_renommer_boutique(tests.id('admin_plateforme'), tests.id('A'), 'Essai A bis'), true, 'renommer change le nom');
select is(public.console_renommer_boutique(tests.id('admin_plateforme'), tests.id('A'), 'Essai A bis'), false, 'le même nom ne change rien');
select is((select slug from plateforme.boutiques where id = tests.id('A')), 'essai-a', 'l''adresse reste');

select public.console_domaine_principal(tests.id('support_plateforme'), tests.id('A'), 'www.essai-a.test');
select is((select hote from plateforme.domaines where boutique_id = tests.id('A') and principal), 'www.essai-a.test',
  'un autre domaine devient principal (un seul à la fois)');
select public.console_domaine_principal(tests.id('admin_plateforme'), tests.id('A'), 'essai-a.test');
select is((select hote from plateforme.domaines where boutique_id = tests.id('A') and principal), 'essai-a.test',
  'et l''on revient au premier');
select throws_ok(format($$ select public.console_retirer_domaine(%L, %L, 'www.essai-a.test') $$, tests.id('support_plateforme'), tests.id('A')),
  '42501', null, 'le support ne retire pas un domaine');
select throws_like(format($$ select public.console_retirer_domaine(%L, %L, 'essai-a.test') $$, tests.id('admin_plateforme'), tests.id('A')),
  '%principal ne se retire pas%', 'le domaine principal ne se retire pas');
select public.console_retirer_domaine(tests.id('admin_plateforme'), tests.id('A'), 'www.essai-a.test');
select is((select count(*)::int from plateforme.domaines where boutique_id = tests.id('A')), 1, 'un secondaire se retire');

reset role;
insert into plateforme.boutiques (id, slug, nom, statut) values (tests.nouvel_id('D'), 'essai-d', 'Essai D', 'en_preparation');
insert into public.reglages (boutique_id, cle, valeur) values (tests.id('A'), 'contact.telephone', '"+216 71 000 000"');
select tests.service();
select throws_like(format($$ select public.console_cloner_configuration(%L, %L, %L) $$, tests.id('admin_plateforme'), tests.id('A'), tests.id('B')),
  '%pas vide%', 'on ne clone pas dans une boutique qui a déjà son catalogue');
select is(public.console_cloner_configuration(tests.id('admin_plateforme'), tests.id('A'), tests.id('D')) - 'reglages',
  '{"rayons": 2, "zones": 1, "caracteristiques": 0}'::jsonb, 'cloner reprend les rayons et la livraison');
reset role;
select is((select count(*)::int from public.reglages where boutique_id = tests.id('D') and cle ~ '^(legal|contact|pub|retrait)\.'), 0,
  'mais pas l''identité de la source');
select is((select valeur from public.reglages where boutique_id = tests.id('D') and cle = 'livraison.mode_frais'), '"zone"'::jsonb,
  'ses autres réglages, si');

-- ---------------------------------------------------------------------
-- L'équipe SkanEcom (seule : sans les super-administrateurs du jeu de développement)
-- ---------------------------------------------------------------------
reset role;
delete from plateforme.administrateurs where role = 'super_admin' and user_id <> tests.id('admin_plateforme');
select tests.service();
select throws_ok(format($$ select public.console_nommer_administrateur(%L, %L, 'super_admin') $$, tests.id('support_plateforme'), tests.id('support_plateforme')),
  '42501', null, 'le support ne se nomme pas super-administrateur');
select throws_like(format($$ select public.console_retirer_administrateur(%L, %L) $$, tests.id('admin_plateforme'), tests.id('admin_plateforme')),
  '%soi-même%', 'on ne se retire pas soi-même');
select throws_like(format($$ select public.console_nommer_administrateur(%L, %L, 'support') $$, tests.id('admin_plateforme'), tests.id('admin_plateforme')),
  '%seul super-administrateur%', 'le dernier super-administrateur le reste');

-- ---------------------------------------------------------------------
-- Les journaux
-- ---------------------------------------------------------------------
select is((public.console_journal(tests.id('support_plateforme'), tests.id('A'), 'domaine') ->> 'total')::int, 3,
  'le journal se filtre par boutique et par genre de geste');
select public.console_noter_envoi('email', 'selma@exemple.tn', 'Maymar', 'Votre code', 'resend', true, null);
select is(public.console_envois(tests.id('admin_plateforme')) #>> '{lignes,0,destinataire}', 's•••@exemple.tn',
  'un envoi est noté, l''adresse masquée');

select * from finish();
rollback;
