-- =====================================================================
-- 82 · Une clé oubliée est aussi coupée dans SkanFact (brique 135)
-- =====================================================================
begin;
\ir outils.psql

select plan(16);

create temp table e (entreprise uuid, autre uuid);
insert into e values ('00000000-0000-4000-8888-00000000e001', '00000000-0000-4000-8888-00000000e002');
grant select on e to authenticated, service_role;
create function pg_temp.coupures() returns text language sql as $$
  select coalesce(string_agg(cle_chiffree, ',' order by cree_le, cle_chiffree), '') from plateforme.skanfact_coupures where boutique_id = tests.id('A')
$$;

reset role;
insert into plateforme.modules_actifs (boutique_id, module) values (tests.id('A'), 'skanfact');
select tests.service();
select public.skanfact_connecter(tests.id('A'), tests.id('proprio_a'), (select entreprise from e), 'Comptoir du Lac SARL', '{}', repeat('a', 40), now() + interval '365 days');
reset role;
select is(pg_temp.coupures(), '', 'connectée une première fois : rien à couper');

-- Renouvelée (la même entreprise, une nouvelle clé) : l'ancienne se coupe
select tests.service();
select public.skanfact_connecter(tests.id('A'), tests.id('proprio_a'), (select entreprise from e), 'Comptoir du Lac SARL', '{}', repeat('b', 40), now() + interval '365 days');
reset role;
select is(pg_temp.coupures(), repeat('a', 40), 'renouvelée : l''ancienne clé entre dans la file des coupures');

-- Coupée par SkanFact (401) : la clé ne vaut déjà plus rien, rien à couper
select tests.service();
select public.skanfact_couper(tests.id('A'));
reset role;
select is(pg_temp.coupures(), repeat('a', 40), 'coupée par SkanFact (401) : rien de plus à couper');
select tests.service();
select public.skanfact_connecter(tests.id('A'), tests.id('proprio_a'), (select entreprise from e), 'Comptoir du Lac SARL', '{}', repeat('c', 40), now() + interval '365 days');
reset role;
select is(pg_temp.coupures(), repeat('a', 40), 'reconnectée après une coupure : la clé refusée ne revient pas dans la file');

-- Déconnecter : la clé oubliée chez SkanEcom, gardée seulement pour la faire couper
reset role; select tests.connecte('proprio_a');
select public.gestion_skanfact_deconnecter(tests.id('A'));
reset role;
select ok(not exists (select 1 from plateforme.skanfact_connexions where boutique_id = tests.id('A')), 'déconnectée : la boutique n''a plus de clé');
select is(pg_temp.coupures(), repeat('a', 40) || ',' || repeat('c', 40), 'la clé quittée attend d''être coupée dans SkanFact');
select tests.connecte('proprio_a');
select is(jsonb_array_length(public.gestion_skanfact_coupures(tests.id('A'))), 2, 'la direction voit ce qui attend SkanFact');
select ok(not (public.gestion_skanfact_coupures(tests.id('A')) -> 0 ? 'cle_chiffree'), 'jamais la clé elle-même');
select is((public.gestion_skanfact_etat(tests.id('A')) ->> 'dus')::int, 2, 'la navigation compte les coupures dues (la file repart en fond)');
reset role; select tests.connecte('proprio_b');
select throws_ok(format($$ select public.gestion_skanfact_coupures(%L) $$, tests.id('A')), '42501', null, 'une autre boutique ne lit rien');
select throws_ok($$ select * from plateforme.skanfact_coupures $$, '42501', null, 'ni la file des coupures');
select throws_ok(format($$ select public.skanfact_prendre_coupures(%L) $$, tests.id('A')), '42501', null, 'ni ne la prend');

-- Le serveur les prend, une fois ; SkanFact en panne : plus tard ; coupée : effacée
reset role; select tests.service();
select is(jsonb_array_length(public.skanfact_prendre_coupures(tests.id('A'))), 2, 'le serveur prend les deux coupures dues');
select is(jsonb_array_length(public.skanfact_prendre_coupures(tests.id('A'))), 0, 'prises : un autre tour ne les reprend pas en même temps');
select public.skanfact_noter_coupure(k.id, case when k.cle_chiffree = repeat('a', 40) then 'fait' else 'plus_tard' end, 'SkanFact ne répond pas')
  from plateforme.skanfact_coupures k where k.boutique_id = tests.id('A');
reset role;
select ok((select count(*) = 1 and bool_and(cle_chiffree = repeat('c', 40) and essais = 1 and erreur = 'SkanFact ne répond pas'
                                            and prochain_essai between now() + interval '50 seconds' and now() + interval '70 seconds')
             from plateforme.skanfact_coupures where boutique_id = tests.id('A')),
  'coupée : effacée ; SkanFact en panne : renvoyée dans une minute, la même clé');

select tests.connecte('proprio_a');
select is(public.gestion_skanfact_avancer(tests.id('A')), 1, '« Renvoyer maintenant » avance la coupure qui attend');

select * from finish();
rollback;
