-- =====================================================================
-- 145 · « Commander à nouveau » : les lignes d'une de SES commandes,
--       relues dans le catalogue du jour
-- =====================================================================
begin;
\ir outils.psql

select plan(7);

create temp table n as select numero from public.commandes where id = tests.id('commande_a');
grant select on n to authenticated, anon;

-- Le catalogue du jour : la valise en vitrine, 4 en stock, son prix a changé depuis.
reset role;
set local skanecom.ecriture_stock = 'on';
update public.produits set publie = true where id = (select produit_id from public.variantes where id = tests.id('variante_a'));
update public.variantes set actif = true, stock = 4, prix_millimes = 199000 where id = tests.id('variante_a');

select tests.connecte('client_a');
create temp table r as select l from jsonb_array_elements(public.recommander(tests.id('A'), (select numero from n))) l;
select is((select count(*)::int from r), 1, 'sa commande : sa ligne revient');
select is((select l ->> 'variante_id' from r)::uuid, tests.id('variante_a'), 'la même déclinaison');
select is((select (l ->> 'prix_millimes')::bigint from r), 199000::bigint, 'au prix du jour, pas à celui de la commande');
select ok((select (l ->> 'disponible')::boolean and (l ->> 'stock')::int = 4 from r), 'en vente, avec son stock du jour');

-- Le produit retiré de la vitrine : la ligne revient, « plus disponible ».
reset role;
update public.produits set publie = false where id = (select produit_id from public.variantes where id = tests.id('variante_a'));
select tests.connecte('client_a');
select is((select (l ->> 'disponible')::boolean from jsonb_array_elements(public.recommander(tests.id('A'), (select numero from n))) l),
  false, 'retiré de la vitrine : plus disponible');

-- Une autre cliente ne lit rien de cette commande ; un visiteur n'a pas le droit.
reset role; select tests.connecte('client_ab');
select is(public.recommander(tests.id('A'), (select numero from n)), '[]'::jsonb, 'la commande d''une autre : rien');
reset role; select tests.anonyme();
select throws_ok($$ select public.recommander(tests.id('A'), 'X') $$, '42501', null, 'sans compte : refusé');

select * from finish();
rollback;
