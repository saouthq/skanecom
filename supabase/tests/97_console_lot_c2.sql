-- =====================================================================
-- 97 · La console, lot C (2) : les coordonnées du client ; suspendre
--      avec un motif et un message que l'équipe de la boutique lit
-- =====================================================================
begin;
\ir outils.psql

select plan(20);

select tests.cree_utilisateur('support_plateforme');
insert into plateforme.administrateurs (user_id, role) values (tests.id('support_plateforme'), 'support');

-- ---------------------------------------------------------------------
-- Les coordonnées du client
-- ---------------------------------------------------------------------
select tests.service();
select throws_ok(format($$ select public.console_enregistrer_contact(%L, %L, '{"nom": "X"}') $$, tests.id('proprio_a'), tests.id('A')),
  '42501', null, 'un propriétaire ne lit ni n''écrit les coordonnées que tient la console');
select is(public.console_contact(tests.id('admin_plateforme'), tests.id('A')), null, 'au départ, rien de noté');

select is(public.console_enregistrer_contact(tests.id('support_plateforme'), tests.id('A'),
  '{"nom": "  Sami Ben Ali, gérant ", "telephone": "20 123 456", "whatsapp": "00216 98-765-432", "email": "Sami@Exemple.TN",
    "matricule": "1234567/a/m/000", "adresse": "", "note": "Joignable l''après-midi"}'),
  array['nom', 'telephone', 'whatsapp', 'email', 'matricule', 'note'], 'le support les note ; la base rend les champs changés');
select is(public.console_contact(tests.id('admin_plateforme'), tests.id('A')) ->> 'telephone', '+21620123456', 'huit chiffres : un numéro tunisien, au format international');
select is(public.console_contact(tests.id('admin_plateforme'), tests.id('A')) ->> 'whatsapp', '+21698765432', '« 00216 » devient « +216 »');
select is(public.console_contact(tests.id('admin_plateforme'), tests.id('A')) ->> 'email', 'sami@exemple.tn', 'l''e-mail en minuscules');
select is(public.console_contact(tests.id('admin_plateforme'), tests.id('A')) ->> 'matricule', '1234567/A/M/000', 'le matricule en capitales');
select is(public.console_contact(tests.id('admin_plateforme'), tests.id('A')) ->> 'nom', 'Sami Ben Ali, gérant', 'le nom sans ses espaces');
select is(public.console_enregistrer_contact(tests.id('admin_plateforme'), tests.id('A'),
  '{"nom": "Sami Ben Ali, gérant", "telephone": "+216 20 123 456", "whatsapp": "98765432", "email": "sami@exemple.tn",
    "matricule": "1234567/A/M/000", "note": "Joignable l''après-midi"}'),
  '{}'::text[], 'les mêmes, tapés autrement : rien n''a changé');
select throws_ok(format($$ select public.console_enregistrer_contact(%L, %L, '{"telephone": "12"}') $$, tests.id('admin_plateforme'), tests.id('A')),
  '23514', null, 'un numéro illisible est refusé');
select throws_ok(format($$ select public.console_enregistrer_contact(%L, %L, '{"email": "pas une adresse"}') $$, tests.id('admin_plateforme'), tests.id('A')),
  '23514', null, 'une adresse e-mail illisible est refusée');
reset role;
select is((select apres -> 'champs' from plateforme.journal_audit where action = 'boutique.contact' and boutique_id = tests.id('A') order by id limit 1),
  '["nom", "telephone", "whatsapp", "email", "matricule", "note"]'::jsonb, 'le journal dit quels champs, pas leur contenu');

-- ---------------------------------------------------------------------
-- Suspendre, avec un motif et un message
-- ---------------------------------------------------------------------
select tests.service();
select throws_ok(format($$ select public.console_suspendre(%L, %L, 'impaye', null) $$, tests.id('support_plateforme'), tests.id('A')),
  '42501', null, 'le support ne suspend pas');
select throws_ok(format($$ select public.console_suspendre(%L, %L, '', null) $$, tests.id('admin_plateforme'), tests.id('A')),
  '23514', null, 'sans motif : refusé');
select throws_ok(format($$ select public.console_suspendre(%L, %L, 'autre', '  ') $$, tests.id('admin_plateforme'), tests.id('A')),
  '23514', null, '« Autre raison » sans message : refusé');
select lives_ok(format($$ select public.console_suspendre(%L, %L, 'impaye', 'Votre abonnement d''octobre reste à régler.') $$, tests.id('admin_plateforme'), tests.id('A')),
  'suspendre avec un motif et un message');

-- L'équipe de A le lit ; celle de B, non.
reset role; select tests.connecte('prepa_a');
select is(public.gestion_suspension(tests.id('A')) ->> 'message', 'Votre abonnement d''octobre reste à régler.', 'l''équipe de la boutique lit le message');
reset role; select tests.connecte('proprio_b');
select is(public.gestion_suspension(tests.id('A')), null, 'une autre boutique ne le lit pas');

-- Rouvrir l'efface ; le journal garde le motif.
select tests.service();
select public.console_changer_statut(tests.id('admin_plateforme'), tests.id('A'), 'active');
reset role;
select is((select row(suspension_motif, suspension_message, suspendue_le)::text from plateforme.boutiques where id = tests.id('A')), '(,,)',
  'rouvrir efface le motif, le message et la date');
select is((select apres ->> 'motif' from plateforme.journal_audit where action = 'boutique.statut' and boutique_id = tests.id('A') and apres ->> 'statut' = 'suspendue'),
  'impaye', 'le journal garde pourquoi');

select * from finish();
rollback;
