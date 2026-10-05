-- =====================================================================
-- 95 · La console, lot B : mot de passe oublié, codes de secours
-- =====================================================================
begin;
\ir outils.psql

select plan(14);

-- ---------------------------------------------------------------------
-- Mot de passe oublié : le rythme
-- ---------------------------------------------------------------------
select tests.service();
select is(public.compte_demande_mot_de_passe('Leila@Exemple.tn '), true, 'une première demande part');
select is(public.compte_demande_mot_de_passe('leila@exemple.tn'), false, 'la même adresse, aussitôt : trop tôt (casse et espaces ignorés)');
select is(public.compte_demande_mot_de_passe('pas-une-adresse'), false, 'une adresse illisible ne part pas');
reset role;
update plateforme.demandes_mot_de_passe set le = le - interval '3 minutes';
select tests.service();
select is(public.compte_demande_mot_de_passe('leila@exemple.tn'), true, 'trois minutes plus tard, si');
reset role;
insert into plateforme.demandes_mot_de_passe (email, le) select 'leila@exemple.tn', now() - interval '10 minutes' from generate_series(1, 4);
select tests.service();
select is((select count(*)::int from plateforme.demandes_mot_de_passe where email = 'leila@exemple.tn'), 6, '(six demandes notées dans l''heure)');
reset role;
update plateforme.demandes_mot_de_passe set le = now() - interval '30 minutes' where email = 'leila@exemple.tn';
select tests.service();
select is(public.compte_demande_mot_de_passe('leila@exemple.tn'), false, 'plus de cinq dans l''heure : la porte reste fermée');

-- ---------------------------------------------------------------------
-- Les codes de secours
-- ---------------------------------------------------------------------
reset role; select tests.connecte('proprio_a');
select throws_ok($$ select public.compte_remplacer_codes_secours(array['AAAAA-BBBBB','CCCCC-DDDDD','EEEEE-FFFFF','GGGGG-HHHHH','JJJJJ-KKKKK','MMMMM-NNNNN','PPPPP-QQQQQ','RRRRR-SSSSS']) $$,
  '42501', null, 'sans double authentification, pas de codes');
select set_config('request.jwt.claims', json_build_object('sub', tests.id('proprio_a'), 'role', 'authenticated', 'aal', 'aal2')::text, true);
select is(public.compte_remplacer_codes_secours(array['AAAAA-BBBBB','CCCCC-DDDDD','EEEEE-FFFFF','GGGGG-HHHHH','JJJJJ-KKKKK','MMMMM-NNNNN','PPPPP-QQQQQ','RRRRR-SSSSS','TTTTT-UUUUU','VVVVV-WWWWW']),
  10, 'en double authentification : dix codes');
select is((public.compte_codes_secours() ->> 'restants')::int, 10, 'dix encore valables');
reset role;
select ok(not exists (select 1 from plateforme.codes_secours where empreinte like '%AAAAA%'), 'la base n''en garde que l''empreinte');
insert into auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at)
values (gen_random_uuid(), tests.id('proprio_a'), 'totp', 'verified', now(), now());

-- Téléphone perdu : connecté par mot de passe (aal1), un code.
select tests.connecte('proprio_a');
select is(public.compte_utiliser_code_secours('zzzzz-zzzzz'), false, 'un code inconnu est refusé');
select is(public.compte_utiliser_code_secours(' cccccddddd '), true, 'un bon code passe (tirets, espaces et casse ignorés)');
select is(public.compte_utiliser_code_secours('CCCCC-DDDDD'), false, 'et ne sert plus');
reset role;
select is((select count(*)::int from auth.mfa_factors where user_id = tests.id('proprio_a')), 0,
  'le facteur perdu est retiré : la nouvelle application s''enregistre');

select * from finish();
rollback;
