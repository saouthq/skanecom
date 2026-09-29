-- =====================================================================
-- 26 · L'accès support au backoffice d'un client, depuis la console (C7)
-- =====================================================================
begin;
\ir outils.psql

select plan(35);

-- L'administrateur de la plateforme, connecté en double authentification
-- (aal2) ou avec son seul mot de passe (aal1).
create function tests.connecte_admin(p_aal text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', tests.id('admin_plateforme'), 'role', 'authenticated', 'aal', p_aal)::text, true);
end;
$$;
create function tests.commandes_vues(p_nom text) returns bigint language sql as $$
  select count(*) from public.commandes where boutique_id = tests.id(p_nom)
$$;
grant execute on all functions in schema tests to authenticated, service_role;

select numero as numero_a from public.commandes where id = tests.id('commande_a') \gset

-- ---------------------------------------------------------------------
-- Portes
-- ---------------------------------------------------------------------
reset role; select tests.anonyme();
select throws_ok(format($$ select public.console_ouvrir_support(%L, %L, 'lecture', 'Voir la commande', 60) $$,
  tests.id('admin_plateforme'), tests.id('A')), '42501', null, 'un visiteur n''ouvre pas d''accès support');
reset role; select tests.connecte_admin('aal2');
select throws_ok(format($$ select public.console_ouvrir_support(%L, %L, 'lecture', 'Voir la commande', 60) $$,
  tests.id('admin_plateforme'), tests.id('A')), '42501', null,
  'l''administrateur lui-même ne l''ouvre pas par l''API : seulement par la console');
select is(tests.commandes_vues('A'), 0::bigint, 'sans accès support, l''administrateur ne voit rien du backoffice de A');

reset role; select tests.service();
select throws_ok(format($$ select public.console_ouvrir_support(%L, %L, 'lecture', 'Voir la commande', 60) $$,
  tests.id('proprio_a'), tests.id('A')), '42501', null, 'la base refuse un acteur qui n''est pas administrateur de la plateforme');
select throws_like(format($$ select public.console_ouvrir_support(%L, %L, 'proprietaire', 'Voir la commande', 60) $$,
  tests.id('admin_plateforme'), tests.id('A')), '%regarder, ou agir%', 'deux modes seulement : jamais propriétaire');
select throws_like(format($$ select public.console_ouvrir_support(%L, %L, 'lecture', '  ok ', 60) $$,
  tests.id('admin_plateforme'), tests.id('A')), '%pourquoi vous entrez%', 'un motif est exigé, en quelques mots');
select throws_like(format($$ select public.console_ouvrir_support(%L, %L, 'lecture', 'Voir la commande', 600) $$,
  tests.id('admin_plateforme'), tests.id('A')), '%15 minutes à 4 heures%', 'une durée bornée');

-- ---------------------------------------------------------------------
-- Regarder
-- ---------------------------------------------------------------------
select ok((public.console_ouvrir_support(tests.id('admin_plateforme'), tests.id('A'), 'lecture',
  '  Le propriétaire ne trouve pas ses frais de livraison ', 60) ->> 'expire_le')::timestamptz = now() + interval '60 minutes',
  'accès ouvert pour une heure');

reset role; select tests.connecte_admin('aal2');
select results_eq($$ select slug, role, support_jusqu_a = now() + interval '60 minutes', support_motif from public.mes_acces() $$,
  $$ values ('essai-a'::text, 'lecture'::text, true, 'Le propriétaire ne trouve pas ses frais de livraison'::text) $$,
  'la boutique figure dans ses accès, avec l''échéance et le motif');
select is(tests.commandes_vues('A'), 2::bigint, 'il voit les commandes de A, comme son équipe');
select is(tests.commandes_vues('B'), 0::bigint, 'et rien de B');
select throws_ok(format($$ select public.gestion_note(%L, %L, 'Vu par le support') $$, tests.id('A'), :'numero_a'),
  '42501', null, 'en mode « regarder », il ne touche à rien');

reset role; select tests.connecte_admin('aal1');
select is(tests.commandes_vues('A'), 0::bigint, 'sans double authentification, l''accès n''ouvre rien');
select throws_ok(format($$ select public.gestion_liste_commandes(%L) $$, tests.id('A')), '42501', null,
  'pas même la liste des commandes');

-- ---------------------------------------------------------------------
-- Agir, puis fermer
-- ---------------------------------------------------------------------
reset role; select tests.service();
select public.console_ouvrir_support(tests.id('admin_plateforme'), tests.id('A'), 'admin', 'Débloquer la commande', 30);
reset role;
select results_eq($$ select role::text, ferme_le is not null, ferme_par = tests.id('admin_plateforme')
                      from plateforme.acces_support where boutique_id = tests.id('A') order by id $$,
  $$ values ('lecture'::text, true, true), ('admin', false, null) $$,
  'rouvrir en « agir » referme l''accès précédent : un seul accès ouvert à la fois');
select throws_ok(format($$ insert into plateforme.acces_support (boutique_id, user_id, role, motif, expire_le)
                            values (%L, %L, 'lecture', 'En double', now() + interval '1 hour') $$,
  tests.id('A'), tests.id('admin_plateforme')), '23505', null, 'la base n''en tolère pas un second');

select tests.connecte_admin('aal2');
select lives_ok(format($$ select public.gestion_note(%L, %L, 'Vu par le support') $$, tests.id('A'), :'numero_a'),
  'en mode « agir », il agit comme un administrateur de la boutique');
select throws_ok(format($$ select public.gestion_ajouter_membre(%L, %L, 'lecture') $$, tests.id('A'), tests.id('inconnu')),
  '42501', null, 'mais l''équipe reste au propriétaire');
select throws_ok(format($$ select public.gestion_liste_commandes(%L) $$, tests.id('B')), '42501', null,
  'et B reste fermée');

reset role; select tests.service();
select is(public.console_fermer_support(tests.id('admin_plateforme'), tests.id('A')), true, 'l''accès se ferme d''un clic');
select is(public.console_fermer_support(tests.id('admin_plateforme'), tests.id('A')), false, 'une seule fois');
reset role; select tests.connecte_admin('aal2');
select is(tests.commandes_vues('A'), 0::bigint, 'fermé, il ne voit plus rien');
select is_empty($$ select * from public.mes_acces() $$, 'et la boutique quitte ses accès');

-- ---------------------------------------------------------------------
-- L'échéance, et l'administrateur qui ne l'est plus
-- ---------------------------------------------------------------------
reset role;
insert into plateforme.acces_support (boutique_id, user_id, role, motif, ouvert_le, expire_le)
values (tests.id('A'), tests.id('admin_plateforme'), 'admin', 'Accès échu', now() - interval '2 hours', now() - interval '1 hour');
select tests.connecte_admin('aal2');
select is(tests.commandes_vues('A'), 0::bigint, 'un accès échu n''ouvre plus rien');

reset role; select tests.service();
select public.console_ouvrir_support(tests.id('admin_plateforme'), tests.id('A'), 'lecture', 'Dernière vérification', 15);
reset role;
select is((select ferme_le from plateforme.acces_support where motif = 'Accès échu'), now() - interval '1 hour',
  'l''accès échu est refermé à son échéance');
delete from plateforme.administrateurs where user_id = tests.id('admin_plateforme');
select tests.connecte_admin('aal2');
select is(tests.commandes_vues('A'), 0::bigint, 'qui n''est plus administrateur de la plateforme perd l''accès aussitôt');
reset role;
insert into plateforme.administrateurs (user_id, role) values (tests.id('admin_plateforme'), 'super_admin');

-- ---------------------------------------------------------------------
-- Ce qui se voit
-- ---------------------------------------------------------------------
select results_eq($$ select action, cible from plateforme.journal_audit
                      where boutique_id = tests.id('A') and action like 'support.%' order by id $$,
  $$ values ('support.ouvert'::text, 'lecture'::text), ('support.ouvert', 'admin'), ('support.ferme', 'admin'),
            ('support.ouvert', 'lecture') $$,
  'chaque ouverture et chaque fermeture au journal d''audit');

select tests.connecte('proprio_a');
select results_eq($$ select x ->> 'qui', x ->> 'role', x ->> 'motif', (x ->> 'ouvert')::boolean
                      from jsonb_array_elements(public.gestion_acces_support(tests.id('A'))) x $$,
  $$ values ('admin_plateforme@tests.skanecom.local'::text, 'lecture'::text, 'Dernière vérification'::text, true),
            ('admin_plateforme@tests.skanecom.local', 'admin', 'Débloquer la commande', false),
            ('admin_plateforme@tests.skanecom.local', 'lecture', 'Le propriétaire ne trouve pas ses frais de livraison', false),
            ('admin_plateforme@tests.skanecom.local', 'admin', 'Accès échu', false) $$,
  'le propriétaire voit qui est entré, dans quel mode, pourquoi, et ce qui est encore ouvert');
reset role; select tests.connecte('lecture_a');
select throws_ok(format($$ select public.gestion_acces_support(%L) $$, tests.id('A')), '42501', null,
  'un employé en lecture ne le lit pas');
reset role; select tests.connecte('proprio_b');
select throws_ok(format($$ select public.gestion_acces_support(%L) $$, tests.id('A')), '42501', null,
  'ni le propriétaire d''une autre boutique');

-- Le propriétaire ferme lui-même un accès encore ouvert.
reset role;
select id as id_ouvert from plateforme.acces_support where motif = 'Dernière vérification' \gset
select tests.connecte('proprio_b');
select throws_ok(format($$ select public.gestion_fermer_support(%L, %s) $$, tests.id('A'), :id_ouvert), '42501', null,
  'le propriétaire d''une autre boutique ne ferme rien chez A');
reset role; select tests.connecte('multi');
select throws_ok(format($$ select public.gestion_fermer_support(%L, %s) $$, tests.id('A'), :id_ouvert), '42501', null,
  'l''administrateur de la boutique non plus : c''est au propriétaire');
reset role; select tests.connecte('proprio_a');
select is(public.gestion_fermer_support(tests.id('A'), :id_ouvert), true, 'le propriétaire ferme l''accès du support');
reset role; select tests.connecte_admin('aal2');
select is(tests.commandes_vues('A'), 0::bigint, 'le support est dehors aussitôt');
reset role;
select results_eq($$ select action, acteur from plateforme.journal_audit
                      where boutique_id = tests.id('A') and action like 'support.%' order by id desc limit 1 $$,
  $$ values ('support.ferme'::text, tests.id('proprio_a')) $$, 'la fermeture est au journal, au nom du propriétaire');

select * from finish();
rollback;
