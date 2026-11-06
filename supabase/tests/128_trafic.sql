-- =====================================================================
-- 128 · Le trafic : les heures lues chez Cloudflare, gardées, relues
-- =====================================================================
begin;
\ir outils.psql

select plan(14);

reset role;
delete from plateforme.trafic_heures;
delete from plateforme.trafic_lecture;
insert into plateforme.administrateurs (user_id, role) values (tests.cree_utilisateur('support_trafic'), 'support');

select tests.service();
-- Une lecture : deux heures de l'application, et son routeur (un par adresse, sur l'aperçu).
select is(public.trafic_noter('reel', true, null, jsonb_build_array(
  jsonb_build_object('heure', date_trunc('hour', now()) - interval '1 hour', 'script', 'skanecom-application', 'principal', true,
                     'requetes', 1200, 'erreurs', 6, 'sous_requetes', 3400, 'cpu_p50', 4.2, 'cpu_p99', 38.5),
  jsonb_build_object('heure', date_trunc('hour', now()), 'script', 'skanecom-application', 'principal', true,
                     'requetes', 300, 'erreurs', 0, 'sous_requetes', 800, 'cpu_p50', 3.9, 'cpu_p99', 22),
  jsonb_build_object('heure', date_trunc('hour', now()), 'script', 'skanecom-apercu-maymar', 'principal', false,
                     'requetes', 300, 'erreurs', 0))), 3, 'une lecture note ses heures');

select is(jsonb_array_length(public.console_trafic(tests.id('support_trafic')) -> 'heures'), 24, 'vingt-quatre heures, les heures sans appel comprises');
select is((public.console_trafic(tests.id('support_trafic')) #>> '{jour,requetes}')::int, 1500, 'les 24 heures : le Worker de l''application seul (le routeur ne compte pas deux fois)');
select is((public.console_trafic(tests.id('support_trafic')) #>> '{jour,erreurs}')::int, 6, 'et ses erreurs');
select is((public.console_trafic(tests.id('support_trafic')) #>> '{jour,cpu_p99}')::real, 38.5::real, 'le temps de calcul : la pire heure');
select is((public.console_trafic(tests.id('support_trafic')) -> 'heures' -> 23 ->> 'requetes')::int, 300, 'l''heure en cours, la dernière de la liste');
select is((public.console_trafic(tests.id('support_trafic')) -> 'heures' -> 0 ->> 'requetes')::int, 0, 'une heure sans appel : zéro');
select is(jsonb_array_length(public.console_trafic(tests.id('support_trafic')) -> 'scripts'), 2, 'le détail : chaque Worker');
select is((public.console_trafic(tests.id('support_trafic')) #>> '{scripts,0,script}'), 'skanecom-application', 'l''application d''abord');

-- Relue, l'heure en cours se remplit (pas de double compte).
select public.trafic_noter('reel', true, null, jsonb_build_array(
  jsonb_build_object('heure', date_trunc('hour', now()), 'script', 'skanecom-application', 'principal', true, 'requetes', 450, 'erreurs', 1)));
select is((public.console_trafic(tests.id('admin_plateforme')) #>> '{jour,requetes}')::int, 1650, 'relue, l''heure en cours est remplacée, pas ajoutée');

-- Cloudflare refuse la clé : la lecture le dit, les heures déjà lues restent, l'heure du dernier succès aussi.
select public.trafic_noter('reel', false, 'Clé refusée (HTTP 403)', '[]'::jsonb);
select is((public.console_trafic(tests.id('admin_plateforme')) #>> '{lecture,detail}'), 'Clé refusée (HTTP 403)', 'le refus : en clair');
select ok((public.console_trafic(tests.id('admin_plateforme')) #>> '{lecture,dernier_ok_le}') is not null
          and (public.console_trafic(tests.id('admin_plateforme')) #>> '{jour,requetes}')::int = 1650, 'les heures lues restent, et le dernier succès');

select throws_ok($$ select public.console_trafic('00000000-0000-0000-0000-000000000000') $$, '42501', null, 'un inconnu ne lit rien');
select tests.anonyme();
select throws_ok($$ select public.trafic_noter('reel', true, null, '[]'::jsonb) $$, '42501', null, 'un visiteur ne note rien');

select * from finish();
rollback;
