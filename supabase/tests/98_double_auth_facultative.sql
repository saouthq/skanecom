-- =====================================================================
-- 98 · La double authentification, facultative par défaut : un réglage
--      de la plateforme et un réglage de chaque boutique
-- =====================================================================
begin;
\ir outils.psql

select plan(15);

create function tests.connecte_aal(p_nom text, p_aal text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', tests.id(p_nom), 'role', 'authenticated', 'aal', p_aal)::text, true);
end;
$$;
grant execute on function tests.connecte_aal(text, text) to authenticated, service_role;
select tests.cree_utilisateur('support_plateforme');
insert into plateforme.administrateurs (user_id, role) values (tests.id('support_plateforme'), 'support');

-- ---------------------------------------------------------------------
-- La plateforme
-- ---------------------------------------------------------------------
select tests.service();
select is(public.console_double_auth_exigee(), false, 'par défaut, la plateforme ne l''exige pas de son équipe');
select throws_ok(format($$ select public.console_exiger_double_auth(%L, true) $$, tests.id('support_plateforme')),
  '42501', null, 'le support ne change pas ce réglage');
select lives_ok(format($$ select public.console_exiger_double_auth(%L, true) $$, tests.id('admin_plateforme')),
  'un super-administrateur l''exige');
select is(public.console_double_auth_exigee(), true, 'désormais exigée');
reset role;
select is((select apres ->> 'obligatoire' from plateforme.journal_audit
             where action = 'administrateur.double_auth_exigee' and acteur = tests.id('admin_plateforme') order by at desc limit 1),
  'true', 'le journal le garde');

-- L'accès support, quand la plateforme l'exige : sans aal2, rien.
select tests.service();
select public.console_ouvrir_support(tests.id('admin_plateforme'), tests.id('A'), 'lecture', 'Regarder une commande', 60);
reset role; select tests.connecte_aal('admin_plateforme', 'aal1');
select throws_ok(format($$ select public.gestion_liste_commandes(%L) $$, tests.id('A')), '42501', null,
  'exigée : sans double authentification, l''accès support n''ouvre rien');
select is(public.double_auth_exigee_pour_moi(), true, 'et la porte du backoffice le sait');

-- Coupée : sans application, l'accès s'ouvre avec le seul mot de passe.
reset role; select tests.service();
select public.console_exiger_double_auth(tests.id('admin_plateforme'), false);
reset role; select tests.connecte_aal('admin_plateforme', 'aal1');
select lives_ok(format($$ select public.gestion_liste_commandes(%L) $$, tests.id('A')),
  'coupée, sans application : l''accès support s''ouvre');
select is(public.double_auth_exigee_pour_moi(), false, 'rien ne l''exige');

-- ---------------------------------------------------------------------
-- Une boutique
-- ---------------------------------------------------------------------
reset role; select tests.connecte_aal('multi', 'aal1');
select throws_ok(format($$ select public.gestion_exiger_double_auth(%L, true) $$, tests.id('A')),
  '42501', null, 'un administrateur de la boutique ne change pas ce réglage');
reset role; select tests.connecte_aal('proprio_a', 'aal1');
select is(public.gestion_double_auth(tests.id('A')) ->> 'obligatoire', 'false', 'par défaut, la boutique ne l''exige pas');
select throws_ok(format($$ select public.gestion_exiger_double_auth(%L, true) $$, tests.id('A')),
  '23514', null, 'le propriétaire l''exige seulement après avoir activé la sienne');
reset role;
insert into auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at)
values (gen_random_uuid(), tests.id('proprio_a'), 'totp', 'verified', now(), now());
select tests.connecte_aal('proprio_a', 'aal2');
select lives_ok(format($$ select public.gestion_exiger_double_auth(%L, true) $$, tests.id('A')), 'la sienne active, il l''exige');
reset role; select tests.connecte_aal('multi', 'aal1');
select is(public.double_auth_exigee_pour_moi(), true, 'l''administrateur de A en est tenu');
reset role; select tests.connecte_aal('prepa_a', 'aal1');
select is(public.double_auth_exigee_pour_moi(), false, 'la préparation, non : le réglage vise ceux qui ont la main');

select * from finish();
rollback;
