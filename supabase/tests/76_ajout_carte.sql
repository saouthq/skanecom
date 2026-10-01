-- =====================================================================
-- 76 · L'ajout au panier depuis la carte : le réglage
-- =====================================================================
begin;
\ir outils.psql

select plan(4);

select results_eq($$ select type_valeur, defaut, public, groupe, module from plateforme.reglages_catalogue where cle = 'catalogue.ajout_carte' $$,
  $$ values ('booleen'::text, 'false'::jsonb, true, 'catalogue'::text, null::text) $$, 'le réglage : coupé par défaut, lu par la vitrine, hors module');

reset role;
insert into public.reglages (boutique_id, cle, valeur) values (tests.id('A'), 'catalogue.ajout_carte', 'true');
select tests.anonyme();
select is((public.boutique_publique('essai-a') #>> '{configuration,reglages,catalogue.ajout_carte}'), 'true', 'la vitrine le lit dans le cadre de la boutique');
select is((public.boutique_publique('essai-b') #>> '{configuration,reglages,catalogue.ajout_carte}'), 'false', 'une autre boutique ne l''a pas : la valeur par défaut');

reset role;
select throws_ok($$ insert into public.reglages (boutique_id, cle, valeur) values (tests.id('B'), 'catalogue.ajout_carte', '"oui"') $$,
  null, null, 'une valeur qui n''est pas un booléen est refusée');

select * from finish();
rollback;
