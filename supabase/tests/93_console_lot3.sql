-- =====================================================================
-- 93 · La console, lot 3 : la double authentification réinitialisée,
--      les rappels des notes, le journal par période, l'export tracé
-- =====================================================================
begin;
\ir outils.psql

select plan(17);

select tests.cree_utilisateur('support_plateforme');
insert into plateforme.administrateurs (user_id, role) values (tests.id('support_plateforme'), 'support');

-- Le téléphone de proprio_a est perdu : un facteur, une session ouverte.
insert into auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at)
values (gen_random_uuid(), tests.id('proprio_a'), 'totp', 'verified', now(), now());
insert into auth.sessions (id, user_id) values (gen_random_uuid(), tests.id('proprio_a'));

-- ---------------------------------------------------------------------
-- La double authentification
-- ---------------------------------------------------------------------
select tests.service();
select throws_ok(format($$ select public.console_reinitialiser_double_auth(%L, %L) $$, tests.id('support_plateforme'), tests.id('proprio_a')),
  '42501', null, 'le support ne réinitialise pas une double authentification');
select throws_ok(format($$ select public.console_reinitialiser_double_auth(%L, %L) $$, tests.id('admin_plateforme'), tests.id('admin_plateforme')),
  '23514', null, 'un super-administrateur ne réinitialise pas la sienne');
select is(public.console_reinitialiser_double_auth(tests.id('admin_plateforme'), tests.id('proprio_a')), 1,
  'celle d''un propriétaire : un facteur retiré');
reset role;
select is((select count(*)::int from auth.mfa_factors where user_id = tests.id('proprio_a')), 0, 'plus aucun facteur');
select is((select count(*)::int from auth.sessions where user_id = tests.id('proprio_a')), 0, 'ses sessions sont tombées');
select is((select count(*)::int from plateforme.journal_audit where action = 'administrateur.double_auth' and acteur = tests.id('admin_plateforme')), 1,
  'le geste est au journal');

-- ---------------------------------------------------------------------
-- Les rappels des notes
-- ---------------------------------------------------------------------
select tests.service();
select public.console_ajouter_note(tests.id('admin_plateforme'), tests.id('A'), 'Rappeler pour le domaine.', false, (now() at time zone 'Africa/Tunis')::date) as du_jour \gset
select public.console_ajouter_note(tests.id('admin_plateforme'), tests.id('A'), 'Point dans une semaine.', false, (now() at time zone 'Africa/Tunis')::date + 7) as plus_tard \gset
select public.console_ajouter_note(tests.id('admin_plateforme'), tests.id('A'), 'Sans rappel.') as sans \gset
select throws_ok(format($$ select public.console_ajouter_note(%L, %L, 'Trop loin.', false, (now() at time zone 'Africa/Tunis')::date + 400) $$,
  tests.id('admin_plateforme'), tests.id('A')), '23514', null, 'un rappel se pose dans l''année');

select ok(exists (select 1 from jsonb_array_elements(public.console_rappels(tests.id('support_plateforme'))) r where (r ->> 'id')::bigint = :du_jour),
  'le rappel du jour remonte (le support le voit aussi)');
select ok(not exists (select 1 from jsonb_array_elements(public.console_rappels(tests.id('admin_plateforme'))) r where (r ->> 'id')::bigint in (:plus_tard, :sans)),
  'ni celui de la semaine prochaine, ni une note sans rappel');
select is((select r -> 'boutique' ->> 'slug' from jsonb_array_elements(public.console_rappels(tests.id('admin_plateforme'))) r where (r ->> 'id')::bigint = :du_jour),
  'essai-a', 'avec sa boutique');
select throws_ok(format($$ select public.console_changer_note(%L, %s, 'rappel_fait') $$, tests.id('admin_plateforme'), :sans),
  '23514', null, 'une note sans rappel ne se dit pas « faite »');
select public.console_changer_note(tests.id('support_plateforme'), :du_jour, 'rappel_fait');
select ok(not exists (select 1 from jsonb_array_elements(public.console_rappels(tests.id('admin_plateforme'))) r where (r ->> 'id')::bigint = :du_jour),
  'dit fait, il ne remonte plus');
select isnt((select n ->> 'rappel_fait_le' from jsonb_array_elements(public.console_notes(tests.id('admin_plateforme'), tests.id('A'))) n where (n ->> 'id')::bigint = :du_jour),
  null, 'et la note garde quand il l''a été');

-- ---------------------------------------------------------------------
-- Le journal par période
-- ---------------------------------------------------------------------
reset role;
insert into plateforme.journal_audit (at, acteur, boutique_id, action, cible)
values ('2026-01-10 23:30+00', tests.id('admin_plateforme'), tests.id('B'), 'boutique.renommer', 'janvier'),  -- le 11 à Tunis
       ('2026-01-12 10:00+01', tests.id('admin_plateforme'), tests.id('B'), 'boutique.renommer', 'le-12');
select tests.service();
select is((public.console_journal(tests.id('admin_plateforme'), tests.id('B'), null, 50, 0, '2026-01-11', '2026-01-11') ->> 'total')::int, 1,
  'un seul jour : le jour de Tunis (23 h 30 à Londres, c''est déjà le 11)');
select is((public.console_journal(tests.id('admin_plateforme'), tests.id('B'), 'boutique', 50, 0, '2026-01-11', null) -> 'lignes' -> 0 ->> 'cible'), 'le-12',
  'depuis un jour : les plus récents d''abord');

-- ---------------------------------------------------------------------
-- L'export se trace
-- ---------------------------------------------------------------------
select public.console_tracer_export(tests.id('support_plateforme'), 'journal', '{"du": "2026-01-11"}');
select throws_ok(format($$ select public.console_tracer_export(%L, 'clients', null) $$, tests.id('admin_plateforme')),
  '23514', null, 'un export inconnu ne se trace pas');
reset role;
select is((select apres ->> 'du' from plateforme.journal_audit where action = 'export.journal' and acteur = tests.id('support_plateforme')), '2026-01-11',
  'l''export du journal est au journal, avec ses filtres');

select * from finish();
rollback;
