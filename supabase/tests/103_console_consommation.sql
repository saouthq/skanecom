-- =====================================================================
-- 103 · La consommation : les envois comptés par boutique, les quotas
--       (formule, exception, crédits), les SMS rattachés à leur boutique,
--       les codes par e-mail au dépassement, le forfait du fournisseur
-- =====================================================================
begin;
\ir outils.psql

select plan(32);

select tests.cree_utilisateur('support_plateforme');
insert into plateforme.administrateurs (user_id, role) values (tests.id('support_plateforme'), 'support');
-- (une base locale peut avoir déjà compté : on part de zéro ; tout est défait à la fin)
delete from plateforme.consommations;
delete from plateforme.credits_envoi;
delete from plateforme.quotas_boutique;
delete from plateforme.reglages_plateforme where cle like 'envois.%';
update plateforme.formules set quota_emails_mois = null, quota_sms_mois = null, prix_sms_sup_millimes = null, prix_emails_sup_millimes = null;
update plateforme.boutiques set formule = 'essentiel' where id = tests.id('A');

select tests.service();
select throws_ok(format($$ select public.console_consommation(%L) $$, tests.id('proprio_a')),
  '42501', null, 'un propriétaire de boutique ne lit pas la consommation');

-- Noter : pour qui, quoi
select public.console_noter_envoi('email', 'leila@exemple.tn', 'Essai A', 'Votre commande', 'relais', true, null, tests.id('A'), 'commande');
select public.console_noter_envoi('email', 'leila@exemple.tn', 'Essai A', 'Votre commande', 'relais', true, null, tests.id('A'), 'commande');
select public.console_noter_envoi('email', 'sami@exemple.tn', 'Essai A', 'Votre code', 'relais', false, 'HTTP 422', tests.id('A'), 'code');
select public.console_noter_envoi('email', 'x@exemple.tn', 'SkanEcom', 'Mot de passe', 'relais', true, null, null, 'equipe');
select public.console_noter_envoi('email', 'y@exemple.tn', 'Inconnue', 'Rien', 'relais', true, null, gen_random_uuid(), 'bizarre');
reset role;

select is((select envoyes from plateforme.consommations where boutique_id = tests.id('A') and canal = 'email' and nature = 'commande'), 2,
  'deux e-mails de commande comptés pour la boutique A');
select is((select refuses || '/' || envoyes from plateforme.consommations where boutique_id = tests.id('A') and nature = 'code'), '1/0',
  'un refus compte à part (pas dans le quota)');
select is((select envoyes from plateforme.consommations where boutique_id is null and nature = 'equipe'), 1, 'SkanEcom elle-même : sans boutique');
select is((select envoyes from plateforme.consommations where boutique_id is null and nature = 'autre'), 1,
  'une boutique inconnue et une nature inconnue : sans boutique, « autre »');
select is((select boutique_id from plateforme.envois where sujet = 'Votre code' order by id desc limit 1), tests.id('A'),
  'le journal des envois dit aussi pour qui');
select ok((select mois = date_trunc('month', now() at time zone 'Africa/Tunis')::date from plateforme.consommations limit 1),
  'le mois est celui de Tunis');

-- Les quotas : la formule, l'exception, les crédits
select tests.service();
select throws_ok(format($$ select public.console_regler_quotas_formule(%L, 'essentiel', 100, 10, null, null) $$, tests.id('support_plateforme')),
  '42501', null, 'le support ne règle pas les quotas');
select ok(public.console_regler_quotas_formule(tests.id('admin_plateforme'), 'essentiel', 100, 10, 80, 15000),
  'le super-administrateur fixe les quotas de la formule Essentiel');
select ok(not public.console_regler_quotas_formule(tests.id('admin_plateforme'), 'essentiel', 100, 10, 80, 15000), 'rien n''a changé : rien d''écrit');
select is((select f -> 'quotas' from jsonb_array_elements(public.console_formules(tests.id('admin_plateforme')) -> 'formules') f where f ->> 'code' = 'essentiel'),
  '{"sms": 10, "emails": 100, "prix_sms": 80, "prix_emails": 15000}'::jsonb, 'les formules disent leurs quotas');
reset role;
select is(private.quota_envois(tests.id('A'), 'email', private.mois_tunis(now())), 100, 'la boutique A a droit à 100 e-mails (sa formule)');
select is(private.quota_envois(tests.id('B'), 'email', private.mois_tunis(now())), null, 'la boutique B, sans formule : pas de limite');

select tests.service();
select ok(public.console_regler_quota_boutique(tests.id('admin_plateforme'), tests.id('A'), 50, null, 'compter'), 'une exception pour A : 50 e-mails');
select throws_ok(format($$ select public.console_regler_quota_boutique(%L, %L, null, null, 'bloquer') $$, tests.id('admin_plateforme'), tests.id('A')),
  '22023', null, 'un comportement au dépassement inconnu est refusé');
select throws_ok(format($$ select public.console_regler_quota_boutique(%L, %L, -1, null, 'compter') $$, tests.id('admin_plateforme'), tests.id('A')),
  '22023', null, 'un quota négatif est refusé');
create temp table credit as select public.console_crediter_envois(tests.id('admin_plateforme'), tests.id('A'), 'email', 25, 'Promotion du mois') as id;
grant select on credit to service_role;
reset role;
select is(private.quota_envois(tests.id('A'), 'email', private.mois_tunis(now())), 75, 'l''exception, plus le crédit du mois : 75');
select is(private.quota_envois(tests.id('A'), 'sms', private.mois_tunis(now())), 10, 'les SMS restent ceux de la formule');
select ok(exists (select 1 from plateforme.journal_audit j where j.action = 'boutique.quotas' and j.boutique_id = tests.id('A')),
  'l''exception est tracée au journal');

select tests.service();
create temp table c as select public.console_consommation(tests.id('support_plateforme')) as j;
grant select on c to service_role;
select is((select b -> 'email' ->> 'envoyes' || '/' || (b -> 'email' ->> 'quota') || ' +' || (b -> 'email' ->> 'credits')
             from c, jsonb_array_elements(j -> 'boutiques') b where b ->> 'slug' = 'essai-a'), '2/75 +25',
  'la console lit : A a envoyé 2 e-mails sur 75, dont 25 de crédit');
select is((select jsonb_array_length(b -> 'email' -> 'historique') || ' ' || (b -> 'email' -> 'historique' ->> 5)
             from c, jsonb_array_elements(j -> 'boutiques') b where b ->> 'slug' = 'essai-a'), '6 2', 'six mois d''historique, le dernier est celui-ci');
select is((select j -> 'totaux' -> 'email' -> 'par_nature' from c), '{"autre": 1, "equipe": 1, "commande": 2}'::jsonb,
  'les totaux de la plateforme, par nature');
select is((select b -> 'exception' from c, jsonb_array_elements(j -> 'boutiques') b where b ->> 'slug' = 'essai-a'),
  '{"sms": null, "emails": 50}'::jsonb, 'l''exception de A, telle que posée');
select public.console_retirer_credit_envois(tests.id('admin_plateforme'), (select id from credit));
reset role;
select is(private.quota_envois(tests.id('A'), 'email', private.mois_tunis(now())), 50, 'le crédit retiré : 50');

-- Les SMS : la vitrine annonce, le crochet lit la boutique (une fois)
select tests.service();
select public.vitrine_annoncer_sms(tests.id('A'), '+216 20 123 456');
select is(public.console_boutique_du_sms('21620123456') ->> 'nom', (select nom from plateforme.boutiques where id = tests.id('A')),
  'le crochet des SMS retrouve la boutique du numéro (chiffres seuls, comme Supabase les donne)');
select is(public.console_boutique_du_sms('21620123456'), null, 'l''annonce ne sert qu''une fois');
reset role;
-- (seulement ce numéro : la base locale garde les annonces récentes des parcours)
select is((select count(*)::int from plateforme.sms_annonces where empreinte = private.empreinte_telephone('21620123456')), 0,
  'et le numéro n''est gardé nulle part');

-- Au dépassement : les codes par e-mail, si la boutique l'a choisi
set local role anon;
select ok(not public.vitrine_codes_par_email(tests.id('A')), 'compter seulement (par défaut) : les SMS continuent');
reset role;
select tests.service();
select public.console_regler_quota_boutique(tests.id('admin_plateforme'), tests.id('A'), 50, 1, 'codes_par_email');
select public.console_noter_envoi('sms', '+21620123456', 'Essai A', 'Code de connexion', 'relais', true, null, tests.id('A'), 'code');
reset role;
set local role anon;
select ok(public.vitrine_codes_par_email(tests.id('A')), 'son SMS du mois parti, les codes passent par e-mail');
reset role;

-- Le forfait du fournisseur
select tests.service();
select ok(public.console_regler_forfait_envoi(tests.id('admin_plateforme'), 'email', 'Resend', 3000, 100), 'le forfait de Resend : 3 000 par mois, 100 par jour');
create temp table q as select public.console_quotas(tests.id('support_plateforme')) as j;
grant select on q to service_role;
select is((select (j -> 'forfaits' -> 'email' ->> 'mois') || ' ' || (j -> 'mois' ->> 'email') from q), '3000 4',
  'le léger, pour « À surveiller » : le forfait, et les e-mails partis ce mois');
select is((select x ->> 'envoyes' || '/' || (x ->> 'quota') from q, jsonb_array_elements(j -> 'boutiques') x
            where (x ->> 'id')::uuid = tests.id('A') and x ->> 'canal' = 'sms'), '1/1', 'et chaque boutique qui a un quota');

select * from finish();
rollback;
