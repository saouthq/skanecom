-- =====================================================================
-- 120 · Les alertes de la surveillance : un e-mail quand ça casse, un quand c'est rétabli
-- =====================================================================
begin;
\ir outils.psql

select plan(24);

reset role;
-- Partir d'une plateforme sans réglage ni incident (dans la transaction : rien ne reste).
delete from plateforme.reglages_plateforme where cle like 'alertes.%';
delete from plateforme.incidents;
update plateforme.boutiques set statut = 'active' where id = tests.id('A');
insert into plateforme.domaines (hote, boutique_id, type, principal)
values ('alerte-a.essai.tn', tests.id('A'), 'personnalise', false)
on conflict (hote) do nothing;

-- Un passage : la vitrine de A répond (ok) ou non.
create function tests.passage(p_ok boolean) returns bigint language sql as $$
  select (public.surveillance_noter(null, 'heure', now(), jsonb_build_array(
    jsonb_build_object('genre', 'page', 'boutique_id', tests.id('A'), 'cible', 'Alerte-A.essai.tn', 'ok', p_ok,
                       'detail', case when p_ok then null else 'La vitrine répond 502' end, 'statut_http', case when p_ok then 200 else 502 end)
  )) ->> 'passage')::bigint
$$;
grant execute on function tests.passage(boolean) to service_role;

select tests.service();

-- Le réglage : coupé par défaut, personne à qui écrire.
select is(public.console_alertes(tests.id('admin_plateforme')) -> 'actives', 'false'::jsonb, 'coupées par défaut');
select is(public.console_alertes(tests.id('admin_plateforme')) -> 'destinataires', '[]'::jsonb, 'personne à qui écrire par défaut');

-- 1. Un raté isolé : l'incident s'ouvre, mais rien à annoncer.
select is(jsonb_array_length(public.surveillance_incidents(tests.passage(false)) -> 'ouverts'), 0,
  'une vitrine qui ne répond pas une fois : l''incident s''ouvre sans alerte (un raté isolé ne réveille personne)');
reset role;
select is((select echecs from plateforme.incidents where cible = 'alerte-a.essai.tn' and clos_le is null), 1,
  'un incident ouvert, un échec à son compte, la cible en minuscules');
select tests.service();

-- Elle répond au passage suivant : l'incident se clôt, sans « rétabli » (jamais annoncé).
select is(jsonb_array_length(public.surveillance_incidents(tests.passage(true)) -> 'retablis'), 0,
  'rétablie avant l''alerte : rien n''est annoncé non plus');
reset role;
select ok((select clos_le is not null from plateforme.incidents where cible = 'alerte-a.essai.tn' order by id desc limit 1),
  'l''incident est clos');
select tests.service();

-- 2. Deux passages de suite en panne : l'alerte.
select public.surveillance_incidents(tests.passage(false));
select is(jsonb_array_length(public.surveillance_incidents(tests.passage(false)) -> 'ouverts'), 1,
  'deux passages de suite sans réponse : un incident à annoncer');
reset role;
select is((select count(*)::int from plateforme.incidents where cible = 'alerte-a.essai.tn' and clos_le is null), 1,
  'un seul incident ouvert pour la même vitrine, quel que soit le nombre de passages');
select tests.service();
select is((public.surveillance_incidents(tests.passage(false)) #>> '{ouverts,0,boutique,slug}'), 'essai-a',
  'l''incident dit sa boutique (pour le lien de l''e-mail)');

-- L'envoi échoue : il se retentera au passage suivant.
select public.surveillance_alertes_notees(
  (select array_agg(id) from plateforme.incidents where cible = 'alerte-a.essai.tn' and clos_le is null), '{}', false, 'Resend : HTTP 500');
select is(jsonb_array_length(public.surveillance_incidents(tests.passage(false)) -> 'ouverts'), 1,
  'un e-mail d''alerte refusé : l''incident reste à annoncer');
reset role;
select is((select alerte_erreur from plateforme.incidents where cible = 'alerte-a.essai.tn' and clos_le is null), 'Resend : HTTP 500',
  'la raison du refus est gardée');
select tests.service();

-- L'envoi part : plus rien à annoncer, même si la panne dure.
select public.surveillance_alertes_notees(
  (select array_agg(id) from plateforme.incidents where cible = 'alerte-a.essai.tn' and clos_le is null), '{}', true, null);
select is(jsonb_array_length(public.surveillance_incidents(tests.passage(false)) -> 'ouverts'), 0,
  'annoncé une fois : la panne qui dure ne réécrit pas à chaque passage');

-- 3. Elle répond de nouveau : « rétabli », une fois.
select is(jsonb_array_length(public.surveillance_incidents(tests.passage(true)) -> 'retablis'), 1,
  'la vitrine répond de nouveau : le rétablissement est à annoncer');
select public.surveillance_alertes_notees('{}',
  (select array_agg(id) from plateforme.incidents where cible = 'alerte-a.essai.tn' and clos_le is not null and alerte_ouverture_le is not null), true, null);
select is(jsonb_array_length(public.surveillance_incidents(tests.passage(true)) -> 'retablis'), 0,
  'annoncé rétabli une fois, pas deux');

-- 4. Les files : dès le premier relevé (elles ont déjà attendu).
reset role;
insert into public.courriels_commandes (boutique_id, commande_id, evenement, etat, prochain_essai, essais)
select tests.id('A'), c.id, 'recue', 'a_envoyer', now() - interval '1 hour', 3
  from public.commandes c where c.boutique_id = tests.id('A') limit 1;
select tests.service();
select ok(exists (select 1 from jsonb_array_elements(public.surveillance_incidents(tests.passage(true)) -> 'ouverts') x
                  where x ->> 'genre' = 'courriels'),
  'des e-mails de commande qui s''entassent : à annoncer dès le premier relevé');
reset role;
delete from public.courriels_commandes where boutique_id = tests.id('A') and etat = 'a_envoyer';
select tests.service();
select public.surveillance_incidents(tests.passage(true));
reset role;
select ok(not exists (select 1 from plateforme.incidents where genre = 'courriels' and boutique_id = tests.id('A') and clos_le is null),
  'la file vidée : l''incident se clôt');

-- 5. Une boutique fermée n'est plus surveillée : son incident se clôt.
select tests.service();
select public.surveillance_incidents(tests.passage(false));
reset role;
update plateforme.boutiques set statut = 'fermee' where id = tests.id('A');
select tests.service();
select public.surveillance_incidents((public.surveillance_noter(null, 'heure', now(), '[]'::jsonb) ->> 'passage')::bigint);
reset role;
select ok(not exists (select 1 from plateforme.incidents where cible = 'alerte-a.essai.tn' and clos_le is null),
  'boutique fermée : l''incident de sa vitrine se clôt (plus rien à surveiller)');
update plateforme.boutiques set statut = 'active' where id = tests.id('A');

-- 6. Le réglage : super-administrateur, adresses lisibles, au journal.
select tests.service();
select throws_ok(format($$ select public.console_regler_alertes(%L, true, '{}') $$, tests.id('admin_plateforme')),
  '23514', 'Une adresse au moins, pour savoir à qui écrire', 'allumées sans adresse : refusé');
select throws_ok(format($$ select public.console_regler_alertes(%L, true, '{"pas une adresse"}') $$, tests.id('admin_plateforme')),
  '23514', null, 'une adresse illisible : refusée');
select is(public.console_regler_alertes(tests.id('admin_plateforme'), true, '{" Skander@SkanEcom.tn ", "skander@skanecom.tn", "papa@skanecom.tn"}') -> 'destinataires',
  '["papa@skanecom.tn", "skander@skanecom.tn"]'::jsonb, 'allumées : les adresses en minuscules, sans doublon');
select is(public.console_alertes(tests.id('admin_plateforme')) -> 'actives', 'true'::jsonb, 'la console les lit allumées');
reset role;
select ok(exists (select 1 from plateforme.journal_audit where action = 'plateforme.alertes' and acteur = tests.id('admin_plateforme')),
  'le réglage passe au journal');
reset role;
insert into plateforme.administrateurs (user_id, role) values (tests.cree_utilisateur('support_alertes'), 'support');
select tests.service();
select throws_ok(format($$ select public.console_regler_alertes(%L, false, '{}') $$, tests.id('support_alertes')),
  '42501', null, 'le rôle support lit, mais ne règle pas les alertes');
reset role;
select tests.anonyme();
select throws_ok($$ select public.surveillance_incidents(1) $$, '42501', null, 'personne d''autre ne touche aux incidents');

select * from finish();
rollback;
