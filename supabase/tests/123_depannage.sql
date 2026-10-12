-- =====================================================================
-- 123 · Le dépannage : maintenance (plateforme, boutique), files relancées
-- =====================================================================
begin;
\ir outils.psql

select plan(24);

reset role;
delete from plateforme.reglages_plateforme where cle = 'maintenance';
delete from plateforme.maintenances;
insert into plateforme.administrateurs (user_id, role) values (tests.cree_utilisateur('support_depannage'), 'support');

-- 0. Au départ : rien en maintenance.
select tests.anonyme();
select is(public.maintenance_etat(), '{"plateforme": null, "boutiques": {}}'::jsonb, 'au départ : rien en maintenance (ce que lit le proxy)');

-- 1. Une boutique en maintenance.
reset role; select tests.service();
select throws_ok(format($$ select public.console_regler_maintenance(%L, %L, true, 'x') $$, tests.id('support_depannage'), tests.id('A')),
  '42501', null, 'le support ne met pas une vitrine en maintenance');
select is(public.console_regler_maintenance(tests.id('admin_plateforme'), tests.id('A'), true, '  Inventaire, de retour à 14 h.  '), true,
  'le super-administrateur la met en maintenance');
reset role; select tests.anonyme();
select is(public.maintenance_etat() #>> '{boutiques,essai-a,message}', 'Inventaire, de retour à 14 h.', 'le proxy la lit, avec son mot (sans les espaces)');
select is(public.maintenance_etat() -> 'plateforme', 'null'::jsonb, 'la plateforme, elle, reste ouverte');
reset role; select tests.service();
select is(public.console_regler_maintenance(tests.id('admin_plateforme'), tests.id('A'), true, 'Autre mot'), true, 'la reposer change son mot');
select is(jsonb_array_length(public.console_maintenance(tests.id('support_depannage')) -> 'boutiques'), 1, 'le support la lit dans la console');
select is(public.console_maintenance(tests.id('admin_plateforme')) #>> '{boutiques,0,message}', 'Autre mot', 'une ligne par boutique, toujours');
select is(public.console_regler_maintenance(tests.id('admin_plateforme'), tests.id('A'), false, null), false, 'rouverte');
reset role;
select is((select count(*)::int from plateforme.maintenances), 0, 'plus rien en maintenance');
select is((select count(*)::int from plateforme.journal_audit where action = 'boutique.maintenance' and boutique_id = tests.id('A')), 3,
  'chaque geste passe au journal de la boutique');

-- L'aperçu de l'équipe : le vrai jeton du brouillon, pas un jeton inventé.
insert into public.themes_brouillons (boutique_id, contenu, jeton)
values (tests.id('A'), '{}'::jsonb, '11111111-2222-4333-8444-555555555555')
on conflict (boutique_id) do update set jeton = excluded.jeton;
select tests.anonyme();
select is(public.maintenance_apercu('essai-a', '11111111-2222-4333-8444-555555555555'), true, 'le jeton du brouillon de la boutique : l''aperçu passe');
select is(public.maintenance_apercu('essai-a', gen_random_uuid()), false, 'un jeton inventé : la page d''attente');
reset role;

-- 2. Toute la plateforme.
select tests.service();
select public.console_regler_maintenance(tests.id('admin_plateforme'), null, true, 'Mise à jour de la base');
reset role; select tests.anonyme();
select is(public.maintenance_etat() #>> '{plateforme,message}', 'Mise à jour de la base', 'la plateforme en maintenance : le proxy le lit');
reset role;
select is(public.maintenance_etat() #>> '{noms,essai-a}', (select nom from plateforme.boutiques where id = tests.id('A')), 'avec le nom de chaque boutique ouverte, pour sa page d''attente');
select is(public.console_maintenance(tests.id('admin_plateforme')) #>> '{plateforme,par}', (select email::text from auth.users where id = tests.id('admin_plateforme')),
  'la console dit qui l''a posée');
select tests.service();
select public.console_regler_maintenance(tests.id('admin_plateforme'), null, false, null);
reset role;
select ok(not exists (select 1 from plateforme.reglages_plateforme where cle = 'maintenance'), 'rouverte : le réglage disparaît');
select ok(exists (select 1 from plateforme.journal_audit where action = 'plateforme.maintenance'), 'au journal de la plateforme');

-- 3. Relancer une file : ce qui attend, et l'abandonné de la semaine.
insert into public.courriels_commandes (boutique_id, commande_id, evenement, etat, prochain_essai, essais, fait_le)
select tests.id('A'), c.id, 'recue', 'refuse', now() + interval '1 hour', 5, now() - interval '1 day'
  from public.commandes c where c.boutique_id = tests.id('A') limit 1;
select tests.service();
select ok((public.console_relancer_file(tests.id('admin_plateforme'), tests.id('A'), 'courriels') ->> 'n')::int >= 1, 'l''e-mail abandonné repart (avec ce qui attendait déjà)');
reset role;
select ok((select etat = 'a_envoyer' and essais = 0 and prochain_essai <= now() from public.courriels_commandes where boutique_id = tests.id('A') order by id desc limit 1),
  'à envoyer, maintenant, ses essais remis à zéro');
select tests.service();
select throws_ok(format($$ select public.console_relancer_file(%L, %L, 'autre') $$, tests.id('admin_plateforme'), tests.id('A')),
  '23514', null, 'une file inconnue : refusée');

-- 4. Le cache vidé : le support le peut, l'adresse revient de la base.
select is(public.console_tracer_cache(tests.id('support_depannage'), tests.id('A')), 'essai-a', 'le support vide un cache : la base rend l''adresse de la boutique');
select throws_ok(format($$ select public.console_tracer_cache(%L, %L) $$, tests.id('admin_plateforme'), gen_random_uuid()),
  'P0002', null, 'une boutique inconnue : refusée');

select tests.anonyme();
select throws_ok(format($$ select public.console_regler_maintenance(%L, null, true, 'x') $$, tests.id('admin_plateforme')),
  '42501', null, 'un visiteur ne touche à rien');

select * from finish();
rollback;
