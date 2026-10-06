-- =====================================================================
-- 105 · Les e-mails réglés depuis la console : le nom affiché, l'adresse
--       de réponse, le domaine d'envoi d'une boutique, l'essai
-- =====================================================================
begin;
\ir outils.psql

select plan(24);

select tests.cree_utilisateur('support_plateforme');
insert into plateforme.administrateurs (user_id, role) values (tests.id('support_plateforme'), 'support');
delete from plateforme.courriels_boutique;
delete from plateforme.reglages_plateforme where cle = 'courriels.reponse_a';

select tests.service();
-- Par défaut : rien de réglé, rien ne change pour l'envoi.
select is(public.courriels_expediteur(tests.id('A')),
  '{"nom": null, "adresse": null, "reponse_a": null, "reponse_plateforme": null}'::jsonb,
  'par défaut : le nom de la boutique, l''expéditeur de la plateforme, pas d''adresse de réponse');
select throws_ok(format($$ select public.console_courriels_boutique(%L, %L) $$, tests.id('proprio_a'), tests.id('A')),
  '42501', null, 'un propriétaire ne lit pas les réglages d''envoi de la console');
select is((public.console_courriels_boutique(tests.id('support_plateforme'), tests.id('A')) ->> 'domaine_actif'), 'false',
  'le support lit : le domaine propre est coupé');
select throws_ok(format($$ select public.console_regler_courriels_boutique(%L, %L, 'X', null) $$, tests.id('support_plateforme'), tests.id('A')),
  '42501', null, 'le support ne règle pas');

-- Le nom affiché et l'adresse de réponse.
select is((public.console_regler_courriels_boutique(tests.id('admin_plateforme'), tests.id('A'), '  Service client <A> ', ' Contact@Essai-A.tn ') ->> 'reponse_a'),
  'contact@essai-a.tn', 'l''adresse de réponse, relue en minuscules');
select is((public.courriels_expediteur(tests.id('A')) ->> 'nom'), 'Service client A', 'le nom affiché, sans chevrons ni guillemets');
select ok(not (public.console_regler_courriels_boutique(tests.id('admin_plateforme'), tests.id('A'), 'Service client A', 'contact@essai-a.tn') ->> 'change')::boolean,
  'rien n''a changé : rien d''écrit');
select throws_ok(format($$ select public.console_regler_courriels_boutique(%L, %L, null, 'pas une adresse') $$, tests.id('admin_plateforme'), tests.id('A')),
  '22023', null, 'une adresse illisible est refusée');

-- Le domaine d'envoi : ajouté (en attente), jamais allumé sans être vérifié.
select is((public.console_poser_domaine_envoi(tests.id('admin_plateforme'), tests.id('A'), 'https://www.Essai-A.tn/', 'commandes',
  'relais', 'dom_1', 'en_attente', '[{"type": "TXT", "nom": "send.essai-a.tn", "valeur": "v=spf1 include:exemple ~all"}]') ->> 'adresse'),
  'commandes@essai-a.tn', 'le domaine se lit sans https:// ni www. : l''adresse est commandes@essai-a.tn');
select throws_ok(format($$ select public.console_activer_domaine_envoi(%L, %L, true) $$, tests.id('admin_plateforme'), tests.id('A')),
  '22023', null, 'pas vérifié : il ne s''allume pas');
select is((public.courriels_expediteur(tests.id('A')) ->> 'adresse'), null, 'et l''envoi part toujours de la plateforme');
select throws_ok(format($$ select public.console_poser_domaine_envoi(%L, %L, 'essai-a.tn', 'commandes', 'relais', null, 'en_attente', '[]') $$,
  tests.id('admin_plateforme'), tests.id('B')), '23505', null, 'un domaine n''envoie que pour une boutique');
select throws_ok(format($$ select public.console_poser_domaine_envoi(%L, %L, 'pas un domaine', 'commandes', 'relais', null, 'en_attente', '[]') $$,
  tests.id('admin_plateforme'), tests.id('B')), '22023', null, 'un domaine illisible est refusé');

-- Vérifié (le support peut lancer la vérification), puis allumé.
select is((public.console_noter_verification_domaine(tests.id('support_plateforme'), tests.id('A'), 'verifie', null) ->> 'statut'), 'verifie',
  'le fournisseur dit vérifié');
select ok(public.console_activer_domaine_envoi(tests.id('admin_plateforme'), tests.id('A'), true), 'vérifié : il s''allume');
select is((public.courriels_expediteur(tests.id('A')) ->> 'adresse'), 'commandes@essai-a.tn', 'l''envoi part de commandes@essai-a.tn');
-- Une vérification perdue le coupe aussitôt.
select is((public.console_noter_verification_domaine(tests.id('admin_plateforme'), tests.id('A'), 'echec', null) ->> 'coupe'), 'true',
  'une vérification perdue le coupe');
select is((public.courriels_expediteur(tests.id('A')) ->> 'adresse'), null, 'et la plateforme reprend l''envoi');
reset role;
select ok((select count(*) >= 3 from plateforme.journal_audit where action = 'boutique.domaine_envoi' and boutique_id = tests.id('A')),
  'ajouté, allumé, coupé : tracé au journal');

-- Retiré : plus rien, l'adresse de réponse reste.
select tests.service();
select is(public.console_retirer_domaine_envoi(tests.id('admin_plateforme'), tests.id('A')), 'essai-a.tn', 'le domaine se retire');
select is((public.courriels_expediteur(tests.id('A')) ->> 'reponse_a'), 'contact@essai-a.tn', 'l''adresse de réponse reste');

-- La plateforme : où vont les réponses de l'équipe.
select ok(public.console_regler_reponse_plateforme(tests.id('admin_plateforme'), 'support@skanecom.tn'), 'la plateforme règle ses réponses');
select is((public.courriels_expediteur(null) ->> 'reponse_plateforme'), 'support@skanecom.tn', 'les e-mails de l''équipe y renvoient');

-- L'essai se compte à SkanEcom, pas au quota de la boutique (la différence : la base locale en a peut-être déjà).
reset role;
create temp table avant as select coalesce(sum(envoyes), 0)::int as n from plateforme.consommations
 where boutique_id is null and nature = 'essai' and mois = private.mois_tunis(now());
select tests.service();
select public.console_noter_envoi('email', 'moi@exemple.tn', 'Essai A', '[Essai] Votre code', 'relais', true, null, tests.id('A'), 'essai');
reset role;
select is(((select coalesce(sum(envoyes), 0)::int from plateforme.consommations
             where boutique_id is null and nature = 'essai' and mois = private.mois_tunis(now())) - (select n from avant)) * 10
        + (select count(*)::int from plateforme.consommations where boutique_id = tests.id('A') and nature = 'essai'),
  10, 'l''essai est compté à SkanEcom (le journal garde la boutique), jamais au quota de la boutique');

select * from finish();
rollback;
