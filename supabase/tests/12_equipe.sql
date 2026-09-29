-- =====================================================================
-- 12 · La console donne l'accès au backoffice : l'équipe d'une boutique
-- =====================================================================
begin;
\ir outils.psql

select plan(32);

-- Équipe de A (outils.psql) : proprio_a, lecture_a, prepa_a, confirm_a, multi (admin).

-- ---------------------------------------------------------------------
-- Portes fermées
-- ---------------------------------------------------------------------
reset role; select tests.connecte('proprio_a');
select throws_ok(format($$ select public.console_equipe(%L) $$, tests.id('A')),
  '42501', null, 'un propriétaire ne lit pas l''équipe par la console');
select throws_ok(format($$ select public.console_ajouter_membre(%L, %L, %L, 'admin') $$,
                        tests.id('proprio_a'), tests.id('A'), tests.id('inconnu')),
  '42501', null, 'un propriétaire n''ajoute personne par la console, même en se déclarant acteur');
reset role; select tests.anonyme();
select throws_ok($$ select public.console_compte('proprio_a@tests.skanecom.local') $$,
  '42501', null, 'un visiteur ne teste pas si une adresse a un compte');

reset role; select tests.service();
select throws_ok(format($$ select public.console_ajouter_membre(%L, %L, %L, 'confirmateur') $$,
                        tests.id('proprio_a'), tests.id('A'), tests.id('inconnu')),
  '42501', null, 'côté serveur aussi, l''acteur doit être administrateur de la plateforme');
select throws_ok(format($$ select public.console_modifier_membre(%L, %L, %L, 'lecture', true) $$,
                        tests.id('multi'), tests.id('A'), tests.id('confirm_a')),
  '42501', null, 'l''admin d''une boutique n''est pas administrateur de la plateforme');

-- ---------------------------------------------------------------------
-- Lecture
-- ---------------------------------------------------------------------
select is(jsonb_array_length(public.console_equipe(tests.id('A'))), 5, 'l''équipe de A compte ses cinq membres');
select is(jsonb_array_length(public.console_equipe(tests.id('B'))), 2, 'celle de B, les siens seulement');
select is((select e ->> 'role' from jsonb_array_elements(public.console_equipe(tests.id('A'))) e
           where (e ->> 'user_id')::uuid = tests.id('confirm_a')), 'confirmateur', 'chaque membre avec son rôle');

reset role;
update auth.users set email_confirmed_at = now() where id = tests.id('proprio_a');
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values (gen_random_uuid(), tests.id('proprio_a'), 'essai', 'totp', 'verified', now(), now());
select tests.service();
select results_eq(format($$ select (e ->> 'en_attente')::boolean, (e ->> 'double_auth')::boolean
                     from jsonb_array_elements(public.console_equipe(%L)) e
                     where (e ->> 'user_id')::uuid in (%L, %L) order by e ->> 'role' desc $$,
                     tests.id('A'), tests.id('proprio_a'), tests.id('confirm_a')),
  $$ values (false, true), (true, false) $$,
  'on voit qui a accepté son invitation et activé la double authentification');

select is(public.console_compte('  PROPRIO_A@tests.skanecom.local ') ->> 'user_id', tests.id('proprio_a')::text,
  'une adresse retrouve son compte, sans égard aux majuscules ni aux espaces');
select is((public.console_compte('proprio_a@tests.skanecom.local') ->> 'confirme')::boolean, true,
  'et dit si ce compte est déjà confirmé (il a son mot de passe)');
select is(public.console_compte('personne@tests.skanecom.local'), null, 'une adresse sans compte ne rend rien');

-- ---------------------------------------------------------------------
-- Ajouter
-- ---------------------------------------------------------------------
select set_config('request.headers', '{"x-console-ip": "198.51.100.9"}', true);
select lives_ok(format($$ select public.console_ajouter_membre(%L, %L, %L, 'confirmateur') $$,
                       tests.id('admin_plateforme'), tests.id('A'), tests.id('inconnu')),
  'l''administrateur ajoute une personne à l''équipe de A');
select results_eq(format($$ select role::text, actif, invite_par from plateforme.membres
                            where boutique_id = %L and user_id = %L $$, tests.id('A'), tests.id('inconnu')),
  format($$ values ('confirmateur'::text, true, %L::uuid) $$, tests.id('admin_plateforme')),
  'elle y entre avec son rôle, et on sait qui l''a invitée');
select results_eq(format($$ select action, cible, avant, apres ->> 'role', host(ip) from plateforme.journal_audit
                            where boutique_id = %L and action like 'equipe.%%' $$, tests.id('A')),
  $$ values ('equipe.ajouter'::text, 'inconnu@tests.skanecom.local'::text, null::jsonb, 'confirmateur'::text, '198.51.100.9'::text) $$,
  'l''ajout est tracé : qui, quel rôle, depuis quelle adresse IP');

reset role; select tests.connecte('inconnu');
select results_eq($$ select slug, role from public.mes_acces() $$, $$ values ('essai-a'::text, 'confirmateur'::text) $$,
  'la personne ajoutée voit sa boutique dans son backoffice');

reset role; select tests.service();
select throws_like(format($$ select public.console_ajouter_membre(%L, %L, %L, 'lecture') $$,
                          tests.id('admin_plateforme'), tests.id('A'), tests.id('confirm_a')),
  '%fait déjà partie de l''équipe%', 'une personne déjà dans l''équipe n''est pas réinvitée (son rôle se change dans la liste)');
select throws_ok(format($$ select public.console_ajouter_membre(%L, %L, %L, 'patron') $$,
                        tests.id('admin_plateforme'), tests.id('B'), tests.id('inconnu')),
  '23514', null, 'un rôle inconnu est refusé');
select throws_ok(format($$ select public.console_ajouter_membre(%L, %L, gen_random_uuid(), 'lecture') $$,
                        tests.id('admin_plateforme'), tests.id('B')),
  'P0002', null, 'un compte inexistant est refusé');

-- ---------------------------------------------------------------------
-- Modifier, désactiver, réactiver
-- ---------------------------------------------------------------------
select lives_ok(format($$ select public.console_modifier_membre(%L, %L, %L, 'confirmateur', false) $$,
                       tests.id('admin_plateforme'), tests.id('A'), tests.id('inconnu')),
  'l''administrateur retire l''accès d''un membre');
reset role; select tests.connecte('inconnu');
select is_empty($$ select * from public.mes_acces() $$, 'le membre désactivé ne voit plus la boutique');
select is((select count(*)::int from public.commandes where boutique_id = tests.id('A')), 0,
  'ni ses commandes');

reset role; select tests.service();
select lives_ok(format($$ select public.console_ajouter_membre(%L, %L, %L, 'preparateur') $$,
                       tests.id('admin_plateforme'), tests.id('A'), tests.id('inconnu')),
  'l''inviter à nouveau le réactive');
select is((select role::text || ' ' || actif from plateforme.membres where boutique_id = tests.id('A') and user_id = tests.id('inconnu')),
  'preparateur true', 'avec le nouveau rôle choisi');
select is((select avant from plateforme.journal_audit where boutique_id = tests.id('A') and action = 'equipe.ajouter'
           order by at desc, id desc limit 1),
  '{"role": "confirmateur", "actif": false}'::jsonb, 'la trace de la réactivation garde l''état d''avant');

select lives_ok(format($$ select public.console_modifier_membre(%L, %L, %L, 'preparateur', true) $$,
                       tests.id('admin_plateforme'), tests.id('A'), tests.id('inconnu')), 'un geste qui ne change rien passe');
select is((select count(*)::int from plateforme.journal_audit where boutique_id = tests.id('A') and action = 'equipe.modifier'), 1,
  'et n''encombre pas le journal');

-- Le dernier propriétaire
select throws_like(format($$ select public.console_modifier_membre(%L, %L, %L, 'admin', true) $$,
                          tests.id('admin_plateforme'), tests.id('A'), tests.id('proprio_a')),
  '%au moins un propriétaire actif%', 'le seul propriétaire ne perd pas son rôle');
select throws_like(format($$ select public.console_modifier_membre(%L, %L, %L, 'proprietaire', false) $$,
                          tests.id('admin_plateforme'), tests.id('A'), tests.id('proprio_a')),
  '%au moins un propriétaire actif%', 'ni son accès');
select lives_ok(format($$ select public.console_modifier_membre(%L, %L, %L, 'proprietaire', true);
                          select public.console_modifier_membre(%L, %L, %L, 'admin', true) $$,
                       tests.id('admin_plateforme'), tests.id('A'), tests.id('multi'),
                       tests.id('admin_plateforme'), tests.id('A'), tests.id('proprio_a')),
  'une fois un autre propriétaire nommé, l''ancien peut changer de rôle');

-- Le lien d'accès remis
select lives_ok(format($$ select public.console_tracer_lien(%L, %L, %L) $$,
                       tests.id('admin_plateforme'), tests.id('A'), tests.id('inconnu')),
  'chaque lien d''accès remis est tracé');
select throws_ok(format($$ select public.console_tracer_lien(%L, %L, %L) $$,
                        tests.id('admin_plateforme'), tests.id('B'), tests.id('inconnu')),
  'P0002', null, 'pas de lien d''accès pour quelqu''un hors de l''équipe');

select * from finish();
rollback;
