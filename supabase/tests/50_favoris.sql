-- =====================================================================
-- 50 · Les favoris
-- =====================================================================
begin;
\ir outils.psql

select plan(12);

-- Un deuxième produit publié dans A, et le brouillon (jamais en favori).
reset role;
insert into public.produits (id, boutique_id, categorie_id, slug, nom_fr, publie)
values (tests.nouvel_id('produit_a2'), tests.id('A'), tests.id('cat_a'), 'sac-cabine', 'Sac cabine', true);

select tests.connecte('client_a');
select is(public.garder_favoris(tests.id('A'), '{valise-cabine}', '{}'), null, 'réglage coupé : rien n''est gardé');
reset role;
insert into public.reglages (boutique_id, cle, valeur) values (tests.id('A'), 'catalogue.favoris', 'true');

select tests.anonyme();
select throws_ok($$ select public.garder_favoris(tests.id('A'), '{valise-cabine}', '{}') $$, '42501', null,
  'un visiteur : sa liste reste dans son navigateur');

reset role; select tests.connecte('client_a');
select is(public.garder_favoris(tests.id('A'), '{sac-cabine,valise-cabine,inconnu}', '{}'), '{sac-cabine,valise-cabine}'::text[],
  'connectée : la liste du navigateur rejoint le compte, dans son ordre ; un slug inconnu est ignoré');
select is(public.garder_favoris(tests.id('A'), '{valise-cabine}', '{}'), '{sac-cabine,valise-cabine}'::text[],
  'un cœur déjà là ne se double pas');
select is(public.garder_favoris(tests.id('A'), '{}', '{sac-cabine}'), '{valise-cabine}'::text[], 'retiré');
select is((select count(*)::integer from public.favoris), 1, 'elle lit les siens');

-- Un autre appareil, la même personne : la fusion rend tout.
select is(public.garder_favoris(tests.id('A'), '{sac-cabine}', '{}'), '{sac-cabine,valise-cabine}'::text[],
  'un autre appareil : sa liste s''ajoute à celle du compte');

-- Dépublié : il sort de la liste rendue.
reset role; update public.produits set publie = false where id = tests.id('produit_a2');
select tests.connecte('client_a');
select is(public.garder_favoris(tests.id('A'), '{}', '{}'), '{valise-cabine}'::text[], 'une pièce retirée de la vente ne s''affiche plus');
reset role; update public.produits set publie = true where id = tests.id('produit_a2');

-- L'équipe : combien, jamais qui.
select tests.connecte('proprio_a');
select is((select count(*)::integer from public.favoris where boutique_id = tests.id('A')), 0, 'l''équipe ne lit pas les favoris de ses clients');
select is(public.gestion_favoris(tests.id('A')) #>> array['produits', tests.id('produit_a')::text], '1', 'elle sait combien aiment la valise');
reset role; select tests.connecte('proprio_b');
select throws_ok($$ select public.gestion_favoris(tests.id('A')) $$, '42501', null, 'une autre boutique : rien');
reset role;
select ok(not has_table_privilege('authenticated', 'public.favoris', 'insert') and not has_function_privilege('anon', 'public.gestion_favoris(uuid)', 'execute'),
  'personne n''écrit dans la table : la fonction seulement');

select * from finish();
rollback;
