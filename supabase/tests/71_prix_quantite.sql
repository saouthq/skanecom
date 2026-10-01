-- =====================================================================
-- 71 · Les prix par quantité (« 2 pour 99 DT »)
-- =====================================================================
begin;
\ir outils.psql

select plan(14);

create function tests.panier(p_variante uuid, p_quantite integer) returns jsonb
language sql as $$ select jsonb_build_array(jsonb_build_object('variante_id', p_variante, 'quantite', p_quantite)) $$;
grant execute on function tests.panier(uuid, integer) to anon, authenticated;

-- Le backoffice règle les paliers (la valise de A : 189,000 l'unité).
select tests.connecte('proprio_a');
select is(jsonb_array_length(public.gestion_enregistrer_paliers(tests.id('A'), tests.id('produit_a'),
  '[{"quantite": 3, "prix_millimes": 480000}, {"quantite": 2, "prix_millimes": 340000}]')), 2,
  'deux paliers : 2 pour 340,000, 3 pour 480,000');
select is(public.gestion_paliers(tests.id('A'), tests.id('produit_a')) -> 0 ->> 'quantite', '2', 'rangés par quantité');
select throws_ok(format($$ select public.gestion_enregistrer_paliers(%L, %L, %L) $$, tests.id('A'), tests.id('produit_a'),
  '[{"quantite": 2, "prix_millimes": 340000}, {"quantite": 3, "prix_millimes": 520000}]'),
  '23514', null, 'à 3 pièces, l''unité plus chère qu''à 2 : refusé');
select throws_ok(format($$ select public.gestion_enregistrer_paliers(%L, %L, %L) $$, tests.id('A'), tests.id('produit_a'),
  '[{"quantite": 2, "prix_millimes": 378000}]'),
  '23514', null, 'un palier qui ne coûte pas moins que l''unité : refusé');
select throws_ok(format($$ select public.gestion_enregistrer_paliers(%L, %L, %L) $$, tests.id('A'), tests.id('produit_a'),
  '[{"quantite": 1, "prix_millimes": 100000}]'),
  '23514', null, 'un palier d''une pièce : refusé');
select throws_ok(format($$ select public.gestion_enregistrer_paliers(%L, %L, %L) $$, tests.id('A'), tests.id('produit_a'),
  '[{"quantite": 2, "prix_millimes": 300000}, {"quantite": 3, "prix_millimes": 400000}, {"quantite": 4, "prix_millimes": 500000}, {"quantite": 5, "prix_millimes": 600000}]'),
  '23514', null, 'quatre paliers : refusé (trois au plus)');
reset role; select tests.connecte('proprio_b');
select throws_ok(format($$ select public.gestion_enregistrer_paliers(%L, %L, %L) $$, tests.id('A'), tests.id('produit_a'), '[]'),
  '42501', null, 'une autre boutique ne touche pas aux prix de A');

-- Le chiffrage les applique, au visiteur de la vitrine.
reset role; select tests.anonyme();
select is((public.devis_commande(tests.id('A'), tests.panier(tests.id('variante_a'), 1)) ->> 'sous_total_millimes')::bigint,
  189000::bigint, 'une pièce : son prix');
select is((public.devis_commande(tests.id('A'), tests.panier(tests.id('variante_a'), 2)) ->> 'sous_total_millimes')::bigint,
  340000::bigint, 'deux pièces : le prix du palier, exactement');
select is((public.devis_commande(tests.id('A'), tests.panier(tests.id('variante_a'), 3)) ->> 'sous_total_millimes')::bigint,
  480000::bigint, 'trois pièces : le palier de trois');
select is((public.devis_commande(tests.id('A'), tests.panier(tests.id('variante_a'), 4)) ->> 'sous_total_millimes')::bigint,
  640000::bigint, 'quatre pièces : le dernier palier, au prorata (160,000 l''unité)');
select ok((
  with d as (select public.devis_commande(tests.id('A'), tests.panier(tests.id('variante_a'), 2)) -> 'lignes' -> 0 as l)
  select (l ->> 'palier')::integer = 2 and (l ->> 'total_sans_palier_millimes')::bigint = 378000
     and (l ->> 'prix_unitaire_millimes')::bigint = 170000 and (l ->> 'total_ligne_millimes')::bigint = 340000 from d),
  'la ligne dit le palier, le prix sans lui et l''unité');
select is((select paliers -> 1 ->> 'prix_millimes' from public.vitrine_produits where boutique_id = tests.id('A') and slug = 'valise-cabine'),
  '480000', 'la vitrine lit les paliers');

-- Vider la liste retire les paliers.
reset role; select tests.connecte('proprio_a');
select is(jsonb_array_length(public.gestion_enregistrer_paliers(tests.id('A'), tests.id('produit_a'), '[]')), 0,
  'une liste vide : plus de prix par quantité');

select * from finish();
rollback;
