-- =====================================================================
-- 130 · Le logo posé par le commerçant (éditeur de la vitrine)
-- =====================================================================
begin;
\ir outils.psql

select plan(11);

reset role;
create temp table v (n integer);
grant all on v to public;
insert into v select version from public.themes where boutique_id = tests.id('A');

-- Le propriétaire pose son logo : le thème change, la version avance.
select tests.connecte('proprio_a');
select is(
  public.gestion_image_marque(tests.id('A'), (select n from v), 'logo',
    '{"chemin": "essai-a/marque/logo-abc.png", "ratio": 4.2, "mode": "masque"}') -> 'logo' ->> 'chemin',
  'essai-a/marque/logo-abc.png', 'le propriétaire pose le logo de sa boutique');
reset role;
select is((select logo_chemin from public.themes where boutique_id = tests.id('A')), 'essai-a/marque/logo-abc.png', 'le thème le garde');
select is((select logo_ratio from public.themes where boutique_id = tests.id('A')), 4.2::numeric, 'avec sa proportion');
select ok((select version from public.themes where boutique_id = tests.id('A')) > (select n from v), 'la version du thème avance');
update v set n = (select version from public.themes where boutique_id = tests.id('A'));

-- Une version périmée (un autre onglet) : refusé.
select tests.connecte('proprio_a');
select throws_ok($$ select public.gestion_image_marque(tests.id('A'), (select n from v) - 1, 'logo', '{"mode": "image"}') $$,
  '23514', null, 'une version périmée est refusée');

-- Changer le mode seul, puis le retirer : l'ancien fichier est rendu comme orphelin.
select is(public.gestion_image_marque(tests.id('A'), (select n from v), 'logo', '{"mode": "image"}') -> 'logo' ->> 'mode', 'image',
  'le mode d''affichage se change seul');
reset role;
update v set n = (select version from public.themes where boutique_id = tests.id('A'));
select tests.connecte('proprio_a');
select is(public.gestion_image_marque(tests.id('A'), (select n from v), 'logo', '{"chemin": null}') -> 'orphelins',
  '["essai-a/marque/logo-abc.png"]'::jsonb, 'retiré : le fichier que plus rien n''emploie est rendu, pour quitter le dépôt');

-- Ce qui n'est pas permis.
reset role;
update v set n = (select version from public.themes where boutique_id = tests.id('A'));
select tests.connecte('proprio_a');
select throws_ok($$ select public.gestion_image_marque(tests.id('A'), (select n from v), 'logo', '{"chemin": "essai-b/marque/logo.png"}') $$,
  '23514', null, 'un fichier d''une autre boutique est refusé');
select throws_ok($$ select public.gestion_image_marque(tests.id('A'), (select n from v), 'ouverture', '{"chemin": "essai-a/marque/x.webp"}') $$,
  '23514', null, 'les photos de l''accueil passent par l''accueil de l''éditeur, pas par ici');
select tests.connecte('prepa_a');
select throws_ok($$ select public.gestion_image_marque(tests.id('A'), (select n from v), 'logo', '{"mode": "masque"}') $$,
  '42501', null, 'un préparateur ne touche pas au logo');
select tests.connecte('proprio_b');
select throws_ok($$ select public.gestion_image_marque(tests.id('A'), (select n from v), 'logo', '{"mode": "masque"}') $$,
  '42501', null, 'ni le propriétaire d''une autre boutique');

select * from finish();
rollback;
