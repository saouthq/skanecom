-- =====================================================================
-- 18 · Le propriétaire gère son équipe depuis le backoffice
-- =====================================================================
begin;
\ir outils.psql

select plan(18);

-- Jeu d'essai (outils.psql) : dans A, proprio_a (seul propriétaire),
-- lecture_a, prepa_a, confirm_a, et multi (admin de A, lecture dans B) ;
-- « inconnu » a un compte, sans équipe.

-- ---------------------------------------------------------------------
-- Portes
-- ---------------------------------------------------------------------
reset role; select tests.connecte('confirm_a');
select throws_ok(format($$ select public.gestion_equipe(%L) $$, tests.id('A')), '42501', null, 'la confirmation ne voit pas l''équipe');
reset role; select tests.connecte('proprio_b');
select throws_ok(format($$ select public.gestion_equipe(%L) $$, tests.id('A')), '42501', null, 'ni le propriétaire d''une autre boutique');

reset role; select tests.connecte('multi');
select is(jsonb_array_length(public.gestion_equipe(tests.id('A'))), 5, 'l''administrateur voit l''équipe');
select throws_ok(format($$ select public.gestion_ajouter_membre(%L, %L, 'lecture') $$, tests.id('A'), tests.id('inconnu')),
  '42501', null, 'mais seul le propriétaire la change');
select throws_ok(format($$ select public.gestion_compte(%L, 'x@y.test') $$, tests.id('A')), '42501', null, 'et cherche un compte');

-- ---------------------------------------------------------------------
-- Le propriétaire
-- ---------------------------------------------------------------------
reset role; select tests.connecte('proprio_a');
select is((select (e ->> 'vous')::boolean from jsonb_array_elements(public.gestion_equipe(tests.id('A'))) e where e ->> 'user_id' = tests.id('proprio_a')::text),
  true, 'le propriétaire se reconnaît dans la liste');
select is((select (e ->> 'lien_possible')::boolean from jsonb_array_elements(public.gestion_equipe(tests.id('A'))) e where e ->> 'user_id' = tests.id('multi')::text),
  false, 'un membre qui appartient aussi à une autre boutique : pas de lien depuis ce backoffice');
select is(public.gestion_compte(tests.id('A'), 'personne@nulle-part.test'), null, 'une adresse sans compte');

select lives_ok(format($$ select public.gestion_ajouter_membre(%L, %L, 'preparateur') $$, tests.id('A'), tests.id('inconnu')),
  'le propriétaire ajoute une personne à son équipe');
select throws_like(format($$ select public.gestion_ajouter_membre(%L, %L, 'lecture') $$, tests.id('A'), tests.id('inconnu')),
  '%fait déjà partie de l''équipe%', 'pas deux fois');
select throws_ok(format($$ select public.gestion_ajouter_membre(%L, %L, 'patron') $$, tests.id('A'), tests.id('client_a')),
  '23514', null, 'un rôle inconnu est refusé');
select lives_ok(format($$ select public.gestion_modifier_membre(%L, %L, 'confirmateur', true) $$, tests.id('A'), tests.id('inconnu')),
  'il change son rôle');
select throws_like(format($$ select public.gestion_modifier_membre(%L, %L, 'admin', true) $$, tests.id('A'), tests.id('proprio_a')),
  '%au moins un propriétaire actif%', 'le seul propriétaire ne se rétrograde pas');

select isnt(public.gestion_lien_membre(tests.id('A'), tests.id('prepa_a')) ->> 'email', null,
  'un lien d''accès pour un membre qui n''appartient qu''à cette boutique');
select throws_ok(format($$ select public.gestion_lien_membre(%L, %L) $$, tests.id('A'), tests.id('multi')),
  '42501', null, 'jamais pour un compte qui sert aussi ailleurs (il se ferait prendre son mot de passe)');
select throws_ok(format($$ select public.gestion_lien_membre(%L, %L) $$, tests.id('A'), tests.id('client_a')),
  'P0002', null, 'ni pour quelqu''un hors de l''équipe');

reset role;
select results_eq(format($$ select action, acteur, apres ->> 'role' from plateforme.journal_audit
                            where boutique_id = %L and action like 'equipe.%%' order by id $$, tests.id('A')),
  format($$ values ('equipe.ajouter'::text, %L::uuid, 'preparateur'::text), ('equipe.modifier', %L, 'confirmateur'), ('equipe.lien', %L, null) $$,
         tests.id('proprio_a'), tests.id('proprio_a'), tests.id('proprio_a')),
  'chaque geste passe au journal, au nom du propriétaire');
select ok((select actif and role = 'confirmateur' from plateforme.membres where boutique_id = tests.id('A') and user_id = tests.id('inconnu')),
  'la personne est dans l''équipe, avec son rôle');

select * from finish();
rollback;
