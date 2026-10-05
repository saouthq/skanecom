-- =====================================================================
-- 96 · La console, lot C : « À surveiller » se met à plus tard ;
--      l'export de la liste des boutiques est tracé
-- =====================================================================
begin;
\ir outils.psql

select plan(13);

select tests.cree_utilisateur('support_plateforme');
insert into plateforme.administrateurs (user_id, role) values (tests.id('support_plateforme'), 'support');

select tests.service();
select throws_ok(format($$ select public.console_reporter_vigilance(%L, %L, 'attention', 1) $$, tests.id('proprio_a'), tests.id('A') || ':attente'),
  '42501', null, 'un propriétaire de boutique ne touche pas à « À surveiller »');
select throws_ok(format($$ select public.console_reporter_vigilance(%L, %L, 'attention', 30) $$, tests.id('admin_plateforme'), tests.id('A') || ':attente'),
  '23514', null, 'un jour ou une semaine, rien d''autre');
select throws_ok(format($$ select public.console_reporter_vigilance(%L, 'pas de clé ; drop', 'attention', 1) $$, tests.id('admin_plateforme')),
  '23514', null, 'une clé mal formée est refusée');
select throws_ok(format($$ select public.console_reporter_vigilance(%L, %L, 'grave', 1) $$, tests.id('admin_plateforme'), tests.id('A') || ':attente'),
  '23514', null, 'un niveau inconnu est refusé');

-- Le support reporte, pour toute l'équipe ; la clé d'une boutique la trace sur elle.
select ok(public.console_reporter_vigilance(tests.id('support_plateforme'), tests.id('A') || ':attente', 'attention', 1) > now() + interval '23 hours',
  'le support reporte un signal jusqu''à demain');
select ok(public.console_reporter_vigilance(tests.id('admin_plateforme'), 'plateforme:envois', 'attention', 7) > now() + interval '6 days',
  'un signal de la plateforme, pour une semaine');
select is(jsonb_array_length(public.console_vigilances_reportees(tests.id('admin_plateforme'))), 2, 'les deux sont tus, pour toute l''équipe');
select is((public.console_vigilances_reportees(tests.id('admin_plateforme')) -> 0 ->> 'cle'), tests.id('A') || ':attente',
  'le plus proche du retour d''abord');
reset role;
select is((select boutique_id from plateforme.journal_audit where action = 'vigilance.reportee' and cible = tests.id('A') || ':attente'), tests.id('A'),
  'le journal le range sous la boutique');

-- Échu : il s'efface, et le signal revient.
update plateforme.vigilances_reportees set jusqua = now() - interval '1 minute' where cle = 'plateforme:envois';
select tests.service();
select is(jsonb_array_length(public.console_vigilances_reportees(tests.id('admin_plateforme'))), 1, 'un report échu s''efface de lui-même');

-- Reprendre tout de suite.
select lives_ok(format($$ select public.console_reprendre_vigilance(%L, %L) $$, tests.id('admin_plateforme'), tests.id('A') || ':attente'),
  'reprendre un signal reporté');
select is(jsonb_array_length(public.console_vigilances_reportees(tests.id('admin_plateforme'))), 0, 'plus rien de tu');

-- L'export des boutiques.
select lives_ok(format($$ select public.console_tracer_export(%L, 'boutiques', '{"statut": "active"}') $$, tests.id('support_plateforme')),
  'l''export de la liste des boutiques se trace');

select * from finish();
rollback;
