-- =====================================================================
-- 131 · La fiche sans compte, retrouvée à la connexion
-- =====================================================================
begin;
\ir outils.psql

select plan(7);

reset role;
-- Un compte au numéro de la fiche « Invité » de A (+216 20 000 003), vérifié par SMS.
select tests.cree_utilisateur('invite_devenu_client');
update auth.users set phone = '21620000003', phone_confirmed_at = now() where id = tests.id('invite_devenu_client');
-- Un compte au même numéro, mais pas vérifié.
select tests.cree_utilisateur('numero_non_verifie');
update auth.users set phone = '21620000004', phone_confirmed_at = null where id = tests.id('numero_non_verifie');
insert into public.clients (boutique_id, nom, telephone) values (tests.id('A'), 'Sans compte', '+21620000004');

select tests.connecte('numero_non_verifie');
select is(public.rattacher_mon_client(tests.id('A')), false, 'un numéro non vérifié ne rattache rien');

select tests.connecte('invite_devenu_client');
select is(public.rattacher_mon_client(tests.id('B')), false, 'dans une boutique où ce numéro n''a pas de fiche : rien');
select is(public.rattacher_mon_client(tests.id('A')), true, 'connecté avec le numéro vérifié : la fiche sans compte lui est rattachée');
reset role;
select is((select user_id from public.clients where id = tests.id('fiche_invite_a')), tests.id('invite_devenu_client'), 'la fiche « Invité » est à son compte');
select tests.connecte('invite_devenu_client');
select is(public.rattacher_mon_client(tests.id('A')), false, 'une seconde fois : rien de plus (le compte a sa fiche)');

-- Un compte qui a déjà sa fiche ne prend pas celle d'un autre.
select tests.connecte('client_a');
select is(public.rattacher_mon_client(tests.id('A')), false, 'un compte qui a sa fiche n''en prend pas une autre');

select tests.anonyme();
select throws_ok($$ select public.rattacher_mon_client(tests.id('A')) $$, '42501', null, 'sans connexion : refusé');

select * from finish();
rollback;
