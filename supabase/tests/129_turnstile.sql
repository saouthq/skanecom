-- =====================================================================
-- 129 · Turnstile : l'annonce d'un numéro garde si le visiteur a été vérifié
-- =====================================================================
begin;
\ir outils.psql

select plan(6);

select tests.service();
select public.vitrine_annoncer_sms(tests.id('A'), '+216 20 111 222', true);
select is(public.console_boutique_du_sms('21620111222') ->> 'verifiee', 'true', 'annoncé après la vérification : le crochet le lit');
select is(public.console_boutique_du_sms('21620111222'), null, 'l''annonce ne sert toujours qu''une fois');
select public.vitrine_annoncer_sms(tests.id('A'), '+216 20 111 333');
select is(public.console_boutique_du_sms('21620111333') ->> 'verifiee', 'false', 'annoncé sans vérification (l''ancien appel, deux arguments) : non vérifié');
-- Une seconde annonce du même numéro remplace la première, vérification comprise.
select public.vitrine_annoncer_sms(tests.id('A'), '+216 20 111 444', true);
select public.vitrine_annoncer_sms(tests.id('A'), '+216 20 111 444', false);
select is(public.console_boutique_du_sms('21620111444') ->> 'verifiee', 'false', 'la dernière annonce compte');
select is(public.console_boutique_du_sms('21620111444'), null, 'puis plus rien');
select tests.anonyme();
select throws_ok($$ select public.vitrine_annoncer_sms(tests.id('A'), '+216 20 111 555', true) $$, '42501', null, 'un visiteur n''annonce rien lui-même');

select * from finish();
rollback;
