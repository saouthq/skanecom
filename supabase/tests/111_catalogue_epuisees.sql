-- =====================================================================
-- 111 · Le catalogue : les déclinaisons épuisées, dites sur la ligne
-- =====================================================================
begin;
\ir outils.psql

select plan(4);

-- produit_a : Noir actif, en stock ; Or, à zéro, s'active (une déclinaison épuisée).
update public.variantes set actif = true where id = tests.id('variante_a_inactive');

reset role; select tests.connecte('lecture_a');
create temp table l as select public.gestion_liste_produits(tests.id('A'), 'tous', null) as j;
select is((select (x ->> 'variantes_epuisees')::int from l, jsonb_array_elements(j -> 'produits') x where (x ->> 'id')::uuid = tests.id('produit_a')), 1,
  'une déclinaison épuisée est comptée');
select ok((select (x ->> 'stock_total')::int from l, jsonb_array_elements(j -> 'produits') x where (x ->> 'id')::uuid = tests.id('produit_a')) > 0,
  'le produit garde du stock ailleurs');
select is((select j -> 'compteurs' ->> 'rupture' from l)::int, 0, 'il n''est pas « en rupture »');
select is((select (x ->> 'variantes_epuisees')::int from l, jsonb_array_elements(j -> 'produits') x where (x ->> 'id')::uuid = tests.id('produit_a_brouillon')), 0,
  'un produit sans déclinaison épuisée : zéro');

select * from finish();
rollback;
