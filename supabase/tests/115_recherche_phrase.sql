-- =====================================================================
-- 115 · La recherche en phrase : le réglage
-- =====================================================================
begin;
\ir outils.psql

select plan(5);

select results_eq($$ select type_valeur, defaut, public, groupe, module from plateforme.reglages_catalogue where cle = 'catalogue.recherche_phrase' $$,
  $$ values ('booleen'::text, 'false'::jsonb, true, 'catalogue'::text, null::text) $$, 'le réglage : coupé par défaut, lu par la vitrine, hors module');
select results_eq($$ select formule from plateforme.formule_droits where droit = 'catalogue.recherche_phrase' order by formule $$,
  $$ values ('complete'::text), ('pro'::text) $$, 'les formules pro et complète l''ouvrent');

reset role;
insert into public.reglages (boutique_id, cle, valeur) values (tests.id('A'), 'catalogue.recherche_phrase', 'true');
select tests.anonyme();
select is((public.boutique_publique('essai-a') #>> '{configuration,reglages,catalogue.recherche_phrase}'), 'true', 'la vitrine le lit dans le cadre de la boutique');
select is((public.boutique_publique('essai-b') #>> '{configuration,reglages,catalogue.recherche_phrase}'), 'false', 'une autre boutique ne l''a pas : la valeur par défaut');

reset role;
select throws_ok($$ insert into public.reglages (boutique_id, cle, valeur) values (tests.id('B'), 'catalogue.recherche_phrase', '"oui"') $$,
  null, null, 'une valeur qui n''est pas un booléen est refusée');

select * from finish();
rollback;
