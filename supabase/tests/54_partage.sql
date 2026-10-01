-- =====================================================================
-- 54 · Partager une fiche : le réglage
-- =====================================================================
begin;
\ir outils.psql

select plan(3);

select results_eq($$ select type_valeur, defaut, public, groupe from plateforme.reglages_catalogue where cle = 'vitrine.partage' $$,
  $$ values ('booleen'::text, 'false'::jsonb, true, 'vitrine'::text) $$, 'le réglage : coupé par défaut, lu par la vitrine, rangé dans Vitrine');

reset role;
insert into public.reglages (boutique_id, cle, valeur) values (tests.id('A'), 'vitrine.partage', 'true');
select tests.anonyme();
select is((public.boutique_publique('essai-a') #>> '{configuration,reglages,vitrine.partage}'), 'true', 'la vitrine le lit dans le cadre de la boutique');
select is((public.boutique_publique('essai-b') #>> '{configuration,reglages,vitrine.partage}'), 'false', 'une autre boutique ne l''a pas : la valeur par défaut');

select * from finish();
rollback;
