-- =====================================================================
-- 134 · Le cadre de la boutique dit si un gouvernorat est hors de toute
--       zone active (il paie le tarif fixe) : la fiche produit en tient
--       compte dans la fourchette des frais qu'elle annonce
-- =====================================================================
begin;
\ir outils.psql

select plan(4);

reset role;
delete from public.zones_gouvernorats where boutique_id = tests.id('A');
delete from public.zones_livraison where boutique_id = tests.id('A');
select is(private.cadre_boutique(tests.id('A')) -> 'hors_zone', 'true'::jsonb, 'sans zone : tout le pays au tarif fixe');

insert into public.zones_livraison (id, boutique_id, nom_fr, frais_millimes, delai_jours_min, delai_jours_max, position)
values ('13400000-0000-4000-8000-000000000001', tests.id('A'), 'Toute la Tunisie', 8000, 1, 3, 1);
insert into public.zones_gouvernorats (boutique_id, gouvernorat_code, zone_id)
select tests.id('A'), g.code, '13400000-0000-4000-8000-000000000001' from public.gouvernorats g;
select is(private.cadre_boutique(tests.id('A')) -> 'hors_zone', 'false'::jsonb, 'chaque gouvernorat dans une zone active : aucun au tarif fixe');

delete from public.zones_gouvernorats where boutique_id = tests.id('A') and gouvernorat_code = 'tataouine';
select is(private.cadre_boutique(tests.id('A')) -> 'hors_zone', 'true'::jsonb, 'un gouvernorat sans zone : il paie le tarif fixe');

insert into public.zones_gouvernorats (boutique_id, gouvernorat_code, zone_id)
values (tests.id('A'), 'tataouine', '13400000-0000-4000-8000-000000000001');
update public.zones_livraison set actif = false where id = '13400000-0000-4000-8000-000000000001';
select is(private.cadre_boutique(tests.id('A')) -> 'hors_zone', 'true'::jsonb, 'sa zone coupée : le tarif fixe');

select * from finish();
rollback;
